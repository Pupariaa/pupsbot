const RedisStore = require('../../services/RedisStore');
const algorithms = {
    Base: require('./algorithms/Base'),
    Balanced: require('./algorithms/Balanced'),
    Dynamic: require('./algorithms/Dynamic'),
    Aggressive: require('./algorithms/Aggressive'),
    Conservative: require('./algorithms/Conservative')
};

async function computeRefinedGlobalPPRange(userPP, topScores, id, progressionData = null, algorithm = 'Base') {
    const performe = new RedisStore();
    await performe.init();
    const t = performe.startTimer();
    const compute = algorithms[algorithm] || algorithms.Base;
    const range = await compute(userPP, topScores, id, progressionData);
    await performe.logDuration('RGPPR', await t.stop('RGPPR'));
    await performe.close();
    return range;
}

module.exports = computeRefinedGlobalPPRange;
