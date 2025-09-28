async function computeAggressivePPRange(userPP, topScores, id, progressionData = null) {
    if (!topScores || topScores.length === 0) {
        const fallbackRange = userPP * 0.5;
        return {
            min: Math.max(0, Math.round(userPP - fallbackRange)),
            max: Math.round(userPP + fallbackRange),
            margin: Math.round(fallbackRange),
            skew: 0
        };
    }

    const ppValues = topScores.map(score => parseFloat(score.pp)).filter(pp => !isNaN(pp));

    if (ppValues.length === 0) {
        const fallbackRange = userPP * 0.5;
        return {
            min: Math.max(0, Math.round(userPP - fallbackRange)),
            max: Math.round(userPP + fallbackRange),
            margin: Math.round(fallbackRange),
            skew: 0
        };
    }

    const sortedPP = ppValues.sort((a, b) => b - a);
    const top3 = sortedPP.slice(0, 3);
    const recentScores = topScores
        .filter(score => {
            const age = (Date.now() - new Date(score.date).getTime()) / 86400000;
            return age <= 30;
        })
        .map(score => parseFloat(score.pp))
        .filter(pp => !isNaN(pp));

    const top3Avg = top3.reduce((sum, pp) => sum + pp, 0) / top3.length;
    const recentAvg = recentScores.length > 0
        ? recentScores.reduce((sum, pp) => sum + pp, 0) / recentScores.length
        : top3Avg;

    const momentumFactor = recentAvg / top3Avg;
    const baseRange = Math.max(80, Math.min(600, userPP * 0.4));

    let adjustment = 0;

    if (momentumFactor > 1.2) {
        adjustment += baseRange * 0.6;
    } else if (momentumFactor < 0.8) {
        adjustment -= baseRange * 0.5;
    }

    if (progressionData && typeof progressionData.global_score === 'number') {
        const score = progressionData.global_score;
        const progressionFactor = (score - 50) / 100;
        adjustment += baseRange * 0.4 * progressionFactor;
    }

    const aggressiveMin = userPP - baseRange + adjustment;
    const aggressiveMax = userPP + baseRange + adjustment;

    return {
        min: Math.max(0, Math.round(aggressiveMin)),
        max: Math.round(aggressiveMax),
        margin: Math.round(baseRange),
        skew: Math.round(adjustment)
    };
}

module.exports = computeAggressivePPRange;
