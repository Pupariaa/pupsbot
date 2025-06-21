const Performe = require('../services/Performe');

async function computeRefinedGlobalPPRange(userPP, topScores, id, progressionData = null) {
    const performe = new Performe();
    await performe.init();
    const t = performe.startTimer();
    const now = Date.now();

    const recentPP = topScores
        .filter(score => {
            const age = (now - new Date(score.date).getTime()) / 86400000;
            return age <= 30;
        })
        .map(score => parseFloat(score.pp))
        .filter(pp => !isNaN(pp));

    const averageRecent = recentPP.length
        ? recentPP.reduce((sum, pp) => sum + pp, 0) / recentPP.length
        : null;

    const base = Math.max(60, Math.min(600, Math.log10(userPP + 1) * 45));
    let skew = 0;

    if (averageRecent !== null) {
        const expected = userPP * 0.06;
        const ratio = averageRecent / expected;

        if (ratio > 1.05) skew = base * 0.55;
        else if (ratio < 0.95) skew = -base * 0.35;
    }

    if (progressionData && typeof progressionData.global_score === 'number') {
        const score = progressionData.global_score;
        const details = progressionData.detail || {};

        const adjustment = (score - 50) / 100;
        skew += base * 0.3 * adjustment;

        for (const mode in details) {
            const d = details[mode];
            if (d.progression_index >= 80 && d.recent_slope > 0.4) {
                skew += base * 0.05;
            }
            if (d.burst_detected) {
                skew += base * 0.05;
            }
            if (d.last_score_days_ago < 10 && d.progression_index >= 70) {
                skew += base * 0.05;
            }
            if (d.best_score_days_ago > 500 && d.recent_slope > 0.5) {
                skew += base * 0.05;
            }
        }

        const staleModes = Object.values(details).filter(m => m.last_score_days_ago > 1000);
        if (staleModes.length >= 2) {
            skew *= 0.8;
        }

        const maxSkew = base * 0.6;
        if (skew > maxSkew) skew = maxSkew;
        if (skew < -maxSkew) skew = -maxSkew;
    }

    const skewedMin = userPP - base + skew;
    const skewedMax = userPP + base + skew;

    await performe.logDuration('RGPPR', await t.stop('RGPPR'));
    await performe.close();

    return {
        min: Math.max(0, Math.round(skewedMin)),
        max: Math.round(skewedMax),
        margin: Math.round(base),
        skew: Math.round(skew)
    };
}

module.exports = computeRefinedGlobalPPRange;