async function computeConservativePPRange(userPP, topScores, id, progressionData = null) {
    if (!topScores || topScores.length === 0) {
        const fallbackRange = userPP * 0.25;
        return {
            min: Math.max(0, Math.round(userPP - fallbackRange)),
            max: Math.round(userPP + fallbackRange),
            margin: Math.round(fallbackRange),
            skew: 0
        };
    }

    const ppValues = topScores.map(score => parseFloat(score.pp)).filter(pp => !isNaN(pp));

    if (ppValues.length === 0) {
        const fallbackRange = userPP * 0.25;
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

    const baseRange = Math.max(40, Math.min(300, userPP * 0.2 + iqr * 0.5));

    let adjustment = 0;

    if (progressionData && typeof progressionData.global_score === 'number') {
        const score = progressionData.global_score;
        const progressionFactor = (score - 50) / 100;
        adjustment = baseRange * 0.2 * progressionFactor;
    }

    const conservativeMin = userPP - baseRange + adjustment;
    const conservativeMax = userPP + baseRange + adjustment;

    return {
        min: Math.max(0, Math.round(conservativeMin)),
        max: Math.round(conservativeMax),
        margin: Math.round(baseRange),
        skew: Math.round(adjustment)
    };
}

module.exports = computeConservativePPRange;
