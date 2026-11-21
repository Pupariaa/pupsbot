const Logger = require('../utils/Logger');
const computeRefinedGlobalPPRange = require('../compute/osu/RefinedGlobalPPRange');
const findScoresByPPRange = require('../compute/osu/findScoreByPPRange');

class AlgorithmManager {
    constructor() {
        this.algorithms = ['Base', 'Balanced', 'Dynamic', 'Aggressive', 'Conservative'];
    }

    async executeAlgorithmStrategy(params) {
        const order = ['Base', ...this.algorithms.filter((name) => name !== 'Base')];

        for (let index = 0; index < order.length; index++) {
            const algorithm = order[index];
            const results = await this._query(params, algorithm);

            if (results) {
                return {
                    results,
                    algorithm,
                    relaxedCriteria: index > 0
                };
            }
        }

        return {
            results: [],
            algorithm: 'Base',
            relaxedCriteria: true
        };
    }

    async _query(options, algorithm) {
        const { min, max } = await computeRefinedGlobalPPRange(
            options.userPP,
            options.top100OsuTr,
            options.eventId,
            options.sum,
            algorithm
        );

        const algorithmResults = await findScoresByPPRange(
            { min, max },
            options.mods,
            options.data,
            options.bpm
        );

        if (!algorithmResults || algorithmResults.length === 0) {
            Logger.service(`[ALGORITHM] ${algorithm} found no results`);
            return null;
        }

        Logger.service(`[ALGORITHM] ${algorithm} found ${algorithmResults.length} results`);
        return algorithmResults;
    }
}

module.exports = AlgorithmManager;
