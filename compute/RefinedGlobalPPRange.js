const Performe = require('../services/Performe');

async function computeRefinedGlobalPPRange(userPP, topScores, id) {
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

    const base = Math.max(50, Math.min(1000, Math.log10(userPP + 1) * 75));
    let skew = 0;

    if (averageRecent !== null) {
        const expected = userPP * 0.06;
        const ratio = averageRecent / expected;

        if (ratio > 1.05) skew = base * 0.5;
        else if (ratio < 0.95) skew = -base * 0.3;
    }

    await performe.logCommand(await t.stop('RGPPR'), 'RGPPR')
    await performe.close();
    return {
        min: userPP - base + Math.min(0, skew),
        max: userPP + base + Math.max(0, skew),
        margin: base,
        skew
    };
}

module.exports = computeRefinedGlobalPPRange;
