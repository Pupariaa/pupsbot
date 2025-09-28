async function computeDynamicPPRange(userPP, topScores, id, progressionData = null) {
    if (!topScores || topScores.length === 0) {
        const fallbackRange = userPP * 0.4;
        return {
            min: Math.max(0, Math.round(userPP - fallbackRange)),
            max: Math.round(userPP + fallbackRange),
            margin: Math.round(fallbackRange),
            skew: 0
        };
    }

    const ppValues = topScores.map(score => parseFloat(score.pp)).filter(pp => !isNaN(pp));

    if (ppValues.length === 0) {
        const fallbackRange = userPP * 0.4;
        return {
            min: Math.max(0, Math.round(userPP - fallbackRange)),
            max: Math.round(userPP + fallbackRange),
            margin: Math.round(fallbackRange),
            skew: 0
        };
    }

    const sortedPP = ppValues.sort((a, b) => a - b);
    const median = sortedPP[Math.floor(sortedPP.length / 2)];
    const q1 = sortedPP[Math.floor(sortedPP.length * 0.25)];
    const q3 = sortedPP[Math.floor(sortedPP.length * 0.75)];
    const iqr = q3 - q1;

    const recentScores = topScores
        .filter(score => {
            const age = (Date.now() - new Date(score.date).getTime()) / 86400000;
            return age <= 60;
        })
        .map(score => parseFloat(score.pp))
        .filter(pp => !isNaN(pp))
        .sort((a, b) => a - b);

    const recentMedian = recentScores.length > 0 ? recentScores[Math.floor(recentScores.length / 2)] : median;
    const recentStdDev = recentScores.length > 1
        ? Math.sqrt(recentScores.reduce((sum, pp) => sum + Math.pow(pp - recentMedian, 2), 0) / recentScores.length)
        : iqr * 0.5;

    const trendFactor = recentScores.length > 0 ? (recentMedian - median) / median : 0;
    const volatilityFactor = Math.min(1.0, recentStdDev / median);

    const baseRange = Math.max(70, Math.min(500, userPP * (0.25 + volatilityFactor * 0.3)));

    let dynamicAdjustment = 0;

    if (Math.abs(trendFactor) > 0.05) {
        dynamicAdjustment = baseRange * trendFactor * 0.6;
    }

    if (progressionData && typeof progressionData.global_score === 'number') {
        const score = progressionData.global_score;
        const progressionFactor = (score - 50) / 100;
        dynamicAdjustment += baseRange * 0.3 * progressionFactor;

        if (progressionData.detail) {
            let consistencyBonus = 0;
            let activityPenalty = 0;

            for (const mode in progressionData.detail) {
                const d = progressionData.detail[mode];

                if (d.progression_index >= 75) {
                    consistencyBonus += baseRange * 0.05;
                }

                if (d.last_score_days_ago > 200) {
                    activityPenalty += baseRange * 0.03;
                }

                if (d.burst_detected && d.recent_slope > 0.3) {
                    consistencyBonus += baseRange * 0.04;
                }
            }

            dynamicAdjustment += consistencyBonus - activityPenalty;
        }
    }

    const maxAdjustment = baseRange * 0.6;
    dynamicAdjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, dynamicAdjustment));

    const dynamicMin = userPP - baseRange + dynamicAdjustment;
    const dynamicMax = userPP + baseRange + dynamicAdjustment;

    return {
        min: Math.max(0, Math.round(dynamicMin)),
        max: Math.round(dynamicMax),
        margin: Math.round(baseRange),
        skew: Math.round(dynamicAdjustment)
    };
}

module.exports = computeDynamicPPRange;
