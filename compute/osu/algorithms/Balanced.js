async function computeBalancedPPRange(userPP, topScores, id, progressionData = null) {
    if (!topScores || topScores.length === 0) {
        const fallbackRange = userPP * 0.35;
        return {
            min: Math.max(0, Math.round(userPP - fallbackRange)),
            max: Math.round(userPP + fallbackRange),
            margin: Math.round(fallbackRange),
            skew: 0
        };
    }

    const ppValues = topScores.map(score => parseFloat(score.pp)).filter(pp => !isNaN(pp));

    if (ppValues.length === 0) {
        const fallbackRange = userPP * 0.35;
        return {
            min: Math.max(0, Math.round(userPP - fallbackRange)),
            max: Math.round(userPP + fallbackRange),
            margin: Math.round(fallbackRange),
            skew: 0
        };
    }

    const sortedPP = ppValues.sort((a, b) => b - a);
    const top10 = sortedPP.slice(0, 10);
    const top10Avg = top10.reduce((sum, pp) => sum + pp, 0) / top10.length;

    const recentScores = topScores
        .filter(score => {
            const age = (Date.now() - new Date(score.date).getTime()) / 86400000;
            return age <= 45;
        })
        .map(score => parseFloat(score.pp))
        .filter(pp => !isNaN(pp));

    const recentAvg = recentScores.length > 0
        ? recentScores.reduce((sum, pp) => sum + pp, 0) / recentScores.length
        : top10Avg;

    const improvementRate = (recentAvg - top10Avg) / top10Avg;
    const baseRange = Math.max(60, Math.min(450, userPP * 0.3));

    let adjustment = 0;

    if (improvementRate > 0.1) {
        adjustment += baseRange * 0.3;
    } else if (improvementRate < -0.1) {
        adjustment -= baseRange * 0.25;
    }

    if (progressionData && typeof progressionData.global_score === 'number') {
        const score = progressionData.global_score;
        const progressionFactor = (score - 50) / 100;
        adjustment += baseRange * 0.25 * progressionFactor;
    }

    const balancedMin = userPP - baseRange + adjustment;
    const balancedMax = userPP + baseRange + adjustment;

    return {
        min: Math.max(0, Math.round(balancedMin)),
        max: Math.round(balancedMax),
        margin: Math.round(baseRange),
        skew: Math.round(adjustment)
    };
}

module.exports = computeBalancedPPRange;
