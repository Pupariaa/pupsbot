function computeCrossModeProgressionPotential(userId, top100ByMode) {
    const modeWeights = { osu: 1.2, mania: 1, taiko: 1, catch: 1 };
    const experienceThreshold = 5000;
    const now = Date.now();

    const result = {
        user_id: userId,
        global_score: 0,
        detail: {},
        summary: ""
    };

    let totalScore = 0;
    let totalWeight = 0;
    const experienceDetected = {};

    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const stddev = arr => {
        const avg = mean(arr);
        return Math.sqrt(mean(arr.map(x => Math.pow(x - avg, 2))));
    };
    const skewness = arr => {
        const avg = mean(arr);
        const std = stddev(arr);
        return arr.length > 2 ? (arr.reduce((s, x) => s + Math.pow((x - avg) / std, 3), 0) * arr.length) / ((arr.length - 1) * (arr.length - 2)) : 0;
    };
    const kurtosis = arr => {
        const avg = mean(arr);
        const std = stddev(arr);
        return arr.length > 3 ? (arr.reduce((s, x) => s + Math.pow((x - avg) / std, 4), 0) * arr.length * (arr.length + 1)) / ((arr.length - 1) * (arr.length - 2) * (arr.length - 3)) - (3 * Math.pow(arr.length - 1, 2)) / ((arr.length - 2) * (arr.length - 3)) : 0;
    };

    for (const mode of Object.keys(top100ByMode)) {
        const rawScores = top100ByMode[mode]?.tr || [];
        experienceDetected[mode] = rawScores.some(score => parseFloat(score.pp) >= experienceThreshold);
        if (rawScores.length < 20) continue;

        const scores = rawScores.map(score => ({
            date: new Date(score.date),
            pp: parseFloat(score.pp),
            acc: parseFloat(score.accuracy || score.accuracy_percentage || 0),
            mods: typeof score.enabled_mods === 'string' ? score.enabled_mods.split(',') : score.enabled_mods || [],
            stars: parseFloat(score.stars || 0)
        })).sort((a, b) => a.date - b.date);

        const minDate = scores[0].date.getTime();
        const maxDate = scores[scores.length - 1].date.getTime();

        const pp = scores.map(s => s.pp);
        const acc = scores.map(s => s.acc);
        const stars = scores.map(s => s.stars);
        const days = scores.map(s => (s.date.getTime() - minDate) / 86400000);

        const recentScores = scores.slice(-20);
        const ppRecent = recentScores.map(s => s.pp);
        const daysRecent = recentScores.map(s => (s.date.getTime() - minDate) / 86400000);

        let slope = 0, burst = 0;
        if (new Set(days).size > 1) {
            const avgX = mean(days);
            const avgY = mean(pp);
            const numerator = days.reduce((sum, x, i) => sum + (x - avgX) * (pp[i] - avgY), 0);
            const denominator = days.reduce((sum, x) => sum + Math.pow(x - avgX, 2), 0);
            slope = denominator !== 0 ? numerator / denominator : 0;
        }
        let recentSlope = 0;
        if (new Set(daysRecent).size > 1) {
            const avgX = mean(daysRecent);
            const avgY = mean(ppRecent);
            const numerator = daysRecent.reduce((sum, x, i) => sum + (x - avgX) * (ppRecent[i] - avgY), 0);
            const denominator = daysRecent.reduce((sum, x) => sum + Math.pow(x - avgX, 2), 0);
            recentSlope = denominator !== 0 ? numerator / denominator : 0;
            burst = recentSlope > slope * 1.5 || recentSlope > 0.4 ? 1 : 0;
        }

        const lastScoreAge = (now - maxDate) / 86400000;
        const bestScoreAge = (now - scores[scores.findIndex(s => s.pp === Math.max(...pp))].date.getTime()) / 86400000;
        const freshnessFactor = Math.max(0.5, 1.3 - lastScoreAge / 360);

        let peakBoost = 1.0;
        if (bestScoreAge > 180) {
            peakBoost = recentSlope > 0.25 ? 1.1 : 0.9;
        }

        const densityFactor = Math.min(2, Math.max(0.6, scores.length / ((now - minDate) / 86400000) * 30));
        const accConsistency = 1 - Math.min(1, stddev(acc) / 10);
        const ppConsistency = 1 - Math.min(1, stddev(pp) / mean(pp));
        const challengeLevel = Math.min(1.5, stddev(stars));
        const skewnessScore = Math.min(2, Math.abs(skewness(pp)));
        const kurtosisScore = Math.min(2, Math.abs(kurtosis(pp)));
        const modsUsed = new Set(scores.flatMap(s => s.mods));
        const modDiversity = Math.min(1, modsUsed.size / 12);
        const overperformingRatio = scores.filter(s => s.pp > mean(pp) * 1.3).length / scores.length;
        const potentialFactor = 1 + Math.min(0.3, overperformingRatio);

        let progressionIndex = 60;
        progressionIndex += slope * 12;
        progressionIndex *= freshnessFactor * densityFactor * accConsistency * ppConsistency;
        progressionIndex *= (1 + modDiversity * 0.1);
        progressionIndex *= (1 + challengeLevel * 0.1);
        progressionIndex *= (1 + skewnessScore * 0.05);
        progressionIndex *= (1 + kurtosisScore * 0.05);
        progressionIndex *= potentialFactor * peakBoost;
        if (burst) progressionIndex *= 1.15;
        if (recentSlope > 0.5) progressionIndex += 10;

        if (!isFinite(progressionIndex)) progressionIndex = 0;
        progressionIndex = Math.max(0, Math.min(100, progressionIndex));

        let boosted = false;
        if (!experienceDetected[mode]) {
            for (const [otherMode, hasExperience] of Object.entries(experienceDetected)) {
                if (otherMode !== mode && hasExperience) {
                    progressionIndex = Math.min(100, progressionIndex + 10);
                    boosted = true;
                    break;
                }
            }
        }

        result.detail[mode] = {
            raw_slope: +slope.toFixed(4),
            recent_slope: +recentSlope.toFixed(4),
            progression_index: +progressionIndex.toFixed(2),
            boosted_by_experience: boosted,
            freshness_factor: +freshnessFactor.toFixed(2),
            density_factor: +densityFactor.toFixed(2),
            acc_consistency: +accConsistency.toFixed(2),
            pp_consistency: +ppConsistency.toFixed(2),
            challenge_level: +challengeLevel.toFixed(2),
            skewness_score: +skewnessScore.toFixed(2),
            kurtosis_score: +kurtosisScore.toFixed(2),
            mod_diversity: modsUsed.size,
            overperforming_scores_ratio: +(overperformingRatio * 100).toFixed(1),
            burst_detected: burst === 1,
            last_score_days_ago: Math.round(lastScoreAge),
            best_score_days_ago: Math.round(bestScoreAge),
            scores_count: rawScores.length
        };

        totalScore += progressionIndex * (modeWeights[mode] || 1);
        totalWeight += (modeWeights[mode] || 1);
    }

    result.global_score = totalWeight > 0 ? +(totalScore / totalWeight).toFixed(2) : 0;
    result.summary = result.global_score >= 90 ? "Exceptional progression and adaptability detected."
        : result.global_score >= 75 ? "Strong and consistent upward trend."
            : result.global_score >= 55 ? "Moderate and steady progression."
                : result.global_score >= 35 ? "Slight progression with some signs of activity."
                    : "Potential underutilized; signs of improvement needed.";

    return result;
}
module.exports = computeCrossModeProgressionPotential;