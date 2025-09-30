/**
 * Manages algorithm execution with multi-tier fallback system
 */

const Logger = require('../utils/Logger');
const computeRefinedGlobalPPRange = require('../compute/osu/RefinedGlobalPPRange');
const findScoresByPPRange = require('../compute/osu/findScoreByPPRange');
const computeTargetPP = require('../compute/osu/targetPP');
const { filterByMods, filterOutTop100 } = require('../utils/osu/ScoreFilters');

class AlgorithmManager {
    constructor() {
        this.algorithms = ['Conservative', 'Balanced', 'Aggressive', 'Base', 'Dynamic'];
    }

    /**
     * Execute multi-level algorithm strategy with progressive fallback
     * @param {Object} params - Algorithm parameters
     * @returns {Object} - Algorithm execution results
     */
    async executeAlgorithmStrategy(params) {
        const {
            userPP,
            top100OsuTr,
            eventId,
            sum,
            mods,
            bpm,
            data,
            allowOtherMods,
            targetPP,
            algorithm
        } = params;

        // If specific algorithm is requested, use only that one
        if (algorithm && algorithm !== 'Base') {
            Logger.service(`[ALGORITHM] Using specific algorithm: ${algorithm}`);
            return await this._trySpecificAlgorithm({
                userPP,
                top100OsuTr,
                eventId,
                sum,
                mods,
                bpm,
                data,
                allowOtherMods,
                targetPP,
                algorithm
            });
        }

        // Level 1: Strict criteria
        const strictResult = await this._tryAlgorithms({
            userPP,
            top100OsuTr,
            eventId,
            sum,
            mods,
            bpm,
            data,
            allowOtherMods,
            targetPP,
            precisionThreshold: 8,
            ppMargin: 15,
            ppRange: { start: targetPP, end: targetPP + 28 }
        });

        if (strictResult.success) {
            return {
                results: strictResult.results,
                algorithm: strictResult.algorithm,
                relaxedCriteria: false
            };
        }

        Logger.service(`[WORKER] No results with strict criteria, trying with relaxed filters...`);

        // Level 2: Relaxed criteria
        const relaxedResult = await this._tryAlgorithms({
            userPP,
            top100OsuTr,
            eventId,
            sum,
            mods,
            bpm,
            data,
            allowOtherMods,
            targetPP,
            precisionThreshold: 10,
            ppMargin: 25,
            ppRange: { start: targetPP - 20, end: targetPP + 50 }
        });

        if (relaxedResult.success) {
            return {
                results: relaxedResult.results,
                algorithm: relaxedResult.algorithm,
                relaxedCriteria: true
            };
        }

        // Level 3: Accept ANY result
        Logger.service(`[WORKER] No results with relaxed criteria, accepting ANY result...`);
        const anyResult = await this._acceptAnyResult({
            userPP,
            top100OsuTr,
            eventId,
            sum,
            mods,
            bpm,
            data,
            allowOtherMods,
            targetPP
        });

        return {
            results: anyResult.results,
            algorithm: anyResult.algorithm,
            relaxedCriteria: true,
            forcedRelaxed: true
        };
    }

    /**
     * Try a specific algorithm only
     */
    async _trySpecificAlgorithm(options) {
        const { algorithm } = options;

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

        if (algorithmResults && algorithmResults.length > 0) {
            const targetPP = computeTargetPP(options.top100OsuTr, options.sum);
            const filtered = filterByMods(algorithmResults, options.mods, options.allowOtherMods);
            const finalResults = filterOutTop100(filtered, options.data.top100.osu.table);

            if (finalResults.length > 0) {
                Logger.service(`[ALGORITHM] ${algorithm} found ${finalResults.length} results`);
                return {
                    results: finalResults,
                    algorithm: algorithm,
                    relaxedCriteria: false
                };
            }
        }

        Logger.service(`[ALGORITHM] ${algorithm} found no results, falling back to multi-algorithm strategy`);
        // Fallback to normal multi-algorithm strategy
        return await this._tryAlgorithms({
            ...options,
            precisionThreshold: 8,
            ppMargin: 15,
            ppRange: { start: options.targetPP, end: options.targetPP + 28 }
        });
    }

    /**
     * Try algorithms with specific criteria
     */
    async _tryAlgorithms(options) {
        const { precisionThreshold, ppMargin, ppRange } = options;

        for (const algorithm of this.algorithms) {
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

            if (algorithmResults && algorithmResults.length > 0) {
                const targetPP = computeTargetPP(options.top100OsuTr, options.sum);
                let filtered = filterByMods(algorithmResults, options.mods, options.allowOtherMods);
                filtered = filterOutTop100(filtered, options.data.top100.osu.table);
                filtered = filtered.filter(score => score.precision < precisionThreshold)
                    .sort((a, b) => b.precision - a.precision);

                let hasValidScore = false;
                for (const score of filtered) {
                    const scorePP = parseFloat(score.pp);
                    let shouldInclude = false;

                    if (options.targetPP !== null) {
                        shouldInclude = Math.abs(scorePP - options.targetPP) <= ppMargin;
                    } else {
                        shouldInclude = !targetPP || (scorePP >= ppRange.start && scorePP <= ppRange.end);
                    }

                    if (shouldInclude) {
                        hasValidScore = true;
                        break;
                    }
                }

                if (hasValidScore) {
                    return {
                        success: true,
                        results: algorithmResults,
                        algorithm
                    };
                }
            } else {
                Logger.service(`[WORKER] Algorithm ${algorithm} found no results, trying next...`);
            }
        }

        return { success: false };
    }

    /**
     * Accept any valid result from any algorithm
     */
    async _acceptAnyResult(options) {
        for (const algorithm of this.algorithms) {
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

            if (algorithmResults && algorithmResults.length > 0) {
                let filtered = filterByMods(algorithmResults, options.mods, options.allowOtherMods);
                filtered = filterOutTop100(filtered, options.data.top100.osu.table);

                if (filtered.length > 0) {
                    Logger.service(`[WORKER] Algorithm ${algorithm} found ${algorithmResults.length} results, accepting ANY valid score with FORCED relaxed criteria`);
                    return {
                        success: true,
                        results: algorithmResults,
                        algorithm
                    };
                }
            }
        }

        return { success: false };
    }
}

module.exports = AlgorithmManager;
