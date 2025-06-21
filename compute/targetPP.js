function computeTargetPP(topScores, userMetrics) {
    if (!Array.isArray(topScores) || topScores.length < 50) return null;
    if (!userMetrics?.detail?.osu) return null;

    const { freshness_factor, pp_consistency, skewness_score } = userMetrics.detail.osu;

    const weights = topScores.slice(0, 100).map((_, i) => Math.pow(0.95, i));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let cumulativeWeight = 0;
    let pivotIndex = 0;
    while (pivotIndex < topScores.length && cumulativeWeight / totalWeight < 0.5) {
        cumulativeWeight += weights[pivotIndex];
        pivotIndex++;
    }

    const pivotScore = topScores[pivotIndex - 1];
    if (!pivotScore || isNaN(pivotScore.pp)) return null;

    const pivotPP = parseFloat(pivotScore.pp);
    const topPP = parseFloat(topScores[0]?.pp || 0);

    let dynamicBoost =
        1.08 + (freshness_factor - 1) * 0.05 + (1 - pp_consistency) * 0.04 + (skewness_score - 1) * 0.015;

    if (dynamicBoost < 1.03) dynamicBoost = 1.03;
    if (dynamicBoost > 1.15) dynamicBoost = 1.15;

    let target = pivotPP * dynamicBoost;

    const maxTarget = topPP + 80;
    if (target > maxTarget) target = maxTarget;

    if (target <= pivotPP) target = pivotPP + 1;

    return parseFloat(Math.round(target * 100) / 100).toFixed(2);
}

module.exports = computeTargetPP;
