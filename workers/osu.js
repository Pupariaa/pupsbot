const Logger = require('../utils/Logger');
const RedisStore = require('../services/RedisStore');
const Thread2Database = require('../services/SQL');
const MetricsCollector = require('../services/MetricsCollector');
const Notifier = require('../services/Notifier');
const OsuApiClient = require('../services/OsuApis/Client');
const { SendBeatmapMessage, SendNotFoundBeatmapMessage } = require('../utils/messages');
const { getUserErrorMessage } = require('../utils/UserFacingError');
const parseCommandParameters = require('../utils/parser/bmParser');
const computeRefinedGlobalPPRange = require('../compute/osu/RefinedGlobalPPRange');
const findScoresByPPRange = require('../compute/osu/findScoreByPPRange');
const computeCrossModeProgressionPotential = require('../compute/osu/CrossModeProgressionPotential');
const computeTargetPP = require('../compute/osu/targetPP');
const modsToBitwise = require('../utils/osu/modsToBitwise');
const { analyzeUserMods } = require('../utils/osu/analyzeUserMods');
const analyzeUserPreferences = require('../utils/osu/analyzeUserPreferences');

function calculatePreferenceScore(score, userStats) {
    let totalScore = 0;
    let factors = 0;

    // Mods preference (weight: 40%)
    if (userStats.modsDistribution) {
        const modsScore = calculateModsPreferenceScore(score, userStats.modsDistribution);
        totalScore += modsScore * 0.4;
        factors += 0.4;
    }

    // Duration preference (weight: 20%)
    if (userStats.durationDistribution) {
        const durationScore = calculateDurationPreferenceScore(score, userStats.durationDistribution);
        totalScore += durationScore * 0.2;
        factors += 0.2;
    }

    // AR preference (weight: 40%)
    if (userStats.averageStats && score.ar) {
        const arScore = calculateARPreferenceScore(parseFloat(score.ar), userStats.averageStats);
        totalScore += arScore * 0.4;
        factors += 0.4;
    }

    return factors > 0 ? totalScore / factors : 0;
}

function calculateModsPreferenceScore(score, userModsDistribution) {
    if (!score.mods || score.mods === "0" || score.mods === "") {
        return parseFloat(userModsDistribution['NM']?.percentage || '0');
    }

    const scoreMods = score.mods.split(',').filter(mod => mod.trim() !== '');
    let totalPreferenceScore = 0;
    let modCount = 0;

    scoreMods.forEach(mod => {
        const modPreference = userModsDistribution[mod];
        if (modPreference) {
            totalPreferenceScore += parseFloat(modPreference.percentage);
            modCount++;
        }
    });

    return modCount > 0 ? totalPreferenceScore / modCount : 0;
}

function calculateDurationPreferenceScore(score, userDurationDistribution) {
    if (!score.total_length) return 0;

    const length = parseFloat(score.total_length);
    let userPreference = 0;

    if (length < 120) {
        userPreference = parseFloat(userDurationDistribution.short?.percentage || '0');
    } else if (length < 240) {
        userPreference = parseFloat(userDurationDistribution.medium?.percentage || '0');
    } else if (length < 360) {
        userPreference = parseFloat(userDurationDistribution.long?.percentage || '0');
    } else {
        userPreference = parseFloat(userDurationDistribution.veryLong?.percentage || '0');
    }

    return userPreference;
}

function calculateARPreferenceScore(scoreAR, userAverageStats) {
    const userAR = parseFloat(userAverageStats.ar || '0');
    if (userAR === 0) return 0;

    // Calculate how close the score AR is to user's preferred AR
    const arDifference = Math.abs(scoreAR - userAR);

    // Convert to percentage (closer = higher score)
    // AR difference of 0 = 100%, difference of 2 = 0%
    const arScore = Math.max(0, 100 - (arDifference * 50));

    return arScore;
}

const osuApi = new OsuApiClient('http://localhost:25586');
const notifier = new Notifier();

let GlobalData;

function filterOutTop100(results, beatmapIdSet) {
    if (beatmapIdSet instanceof Set) {
        return results.filter(score => !beatmapIdSet.has(parseInt(score.beatmap_id, 10)));
    } else if (Array.isArray(beatmapIdSet)) {
        return results.filter(score => !beatmapIdSet.includes(parseInt(score.beatmap_id, 10)));
    } else if (beatmapIdSet && typeof beatmapIdSet === 'object') {
        const beatmapIds = Object.keys(beatmapIdSet).map(id => parseInt(id, 10));
        return results.filter(score => !beatmapIds.includes(parseInt(score.beatmap_id, 10)));
    }
    return results;
}

function filterByMods(results, requiredModsArray, isAllowOtherMods = false) {
    const requiredMods = modsToBitwise(requiredModsArray);
    const neutralModsMask = 32 | 16384;

    return results.filter(score => {
        const scoreMods = parseInt(score.mods, 10);
        const scoreModsWithoutNeutral = scoreMods & ~neutralModsMask;
        const requiredWithoutNeutral = requiredMods & ~neutralModsMask;

        if (requiredWithoutNeutral === 0 && !isAllowOtherMods) {
            return scoreModsWithoutNeutral === 0;
        }

        if (isAllowOtherMods) {
            return (scoreModsWithoutNeutral & requiredWithoutNeutral) === requiredWithoutNeutral;
        } else {
            return scoreModsWithoutNeutral === requiredWithoutNeutral;
        }
    });
}

function pickBestRandomPrecision(filtered) {
    for (let precision = 1; precision <= 8; precision++) {
        const candidates = filtered.filter(s => parseInt(s.precision) === precision);
        if (candidates.length > 0) {
            const rand = Math.floor(Math.random() * candidates.length);
            return candidates[rand];
        }
    }
    return null;
}

process.on('message', async (data) => {
    GlobalData = data;

    // data.user.id = 17265355
    // data.user.pp = 13573
    // data.user.username = "H O R I Z"
    // Check if rate limit is still valid
    if (!data.event.rateLimitValid) {
        Logger.service(`[WORKER] Rate limit invalid for user ${data.user.id}, aborting`);
        return;
    }

    const db = new Thread2Database();
    const redisStore = new RedisStore();
    const metricsCollector = new MetricsCollector();
    const startTime = Date.now();

    try {
        Logger.task('OSU Worker received data, starting processing...');
        let elapsed;

        await db.connect();
        await redisStore.init();
        await metricsCollector.init();

        const params = parseCommandParameters(data.event.message);
        await metricsCollector.recordStepDuration(data.event.id, 'parse_params');
        const suggestions = await redisStore.getUserSuggestions(data.user.id);
        await metricsCollector.recordStepDuration(data.event.id, 'get_suggestions');

        let top100 = await redisStore.getTop100(data.user.id);
        await metricsCollector.recordStepDuration(data.event.id, 'get_top100_cache');

        if (!top100) {
            top100 = await osuApi.getTopScoresAllModes(data.user.id, data.event.id);
            await metricsCollector.recordStepDuration(data.event.id, 'get_top100_api');
            if (top100) {
                await redisStore.recordTop100(data.user.id, top100, 300);
                await metricsCollector.recordStepDuration(data.event.id, 'record_top100_cache');
            }
        } else {
            setImmediate(async () => {
                try {
                    const freshTop100 = await osuApi.getTopScoresAllModes(data.user.id, data.event.id);
                    if (freshTop100) {
                        await redisStore.recordTop100(data.user.id, freshTop100, 300);
                    }
                } catch (error) {
                    Logger.errorCatch('Background top100 update', error);
                }
            });
        }

        if (!top100 || !top100.osu || !top100.osu.tr || top100.osu.tr.length === 0) {
            const msg = await SendNotFoundBeatmapMessage(data.user.locale);
            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_NO_SCORES'
            });
            elapsed = Date.now() - startTime;
            await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, elapsed);
            await metricsCollector.updateCommandResult(data.event.id, 'not_scores');
            return;
        }

        const top100Osu = top100.osu;

        const userModsAnalysis = analyzeUserMods(top100Osu.tr);
        if (userModsAnalysis) {
            await redisStore.setUserModsAnalysis(data.user.id, userModsAnalysis, 3600);
        }

        const userStats = analyzeUserPreferences(top100Osu.tr);

        const sum = computeCrossModeProgressionPotential(data.user.id, top100);
        await metricsCollector.recordStepDuration(data.event.id, 'compute_cross_mode_progression_potential');

        const algorithms = ['Conservative', 'Balanced', 'Aggressive', 'Base', 'Dynamic'];
        let results = [];
        let usedAlgorithm = '';
        let relaxedCriteria = false;

        for (const algorithm of algorithms) {
            const { min, max } = await computeRefinedGlobalPPRange(data.user.pp, top100Osu.tr, data.event.ids, sum, algorithm);
            await metricsCollector.recordStepDuration(data.event.id, 'compute_refined_global_pprange');

            const algorithmResults = await findScoresByPPRange({ min, max }, params.mods, data, params.bpm);

            if (algorithmResults && algorithmResults.length > 0) {
                const targetPP = computeTargetPP(top100Osu.tr, sum);
                let filtered = filterByMods(algorithmResults, params.mods, params.allowOtherMods);
                filtered = filterOutTop100(filtered, top100Osu.table);
                filtered = filtered.filter(score => score.precision < 8).sort((a, b) => b.precision - a.precision);

                let hasValidScore = false;
                for (const score of filtered) {
                    const scorePP = parseFloat(score.pp);
                    let shouldInclude = false;

                    if (params.pp !== null) {
                        const ppMargin = 15;
                        shouldInclude = Math.abs(scorePP - params.pp) <= ppMargin;
                    } else {
                        shouldInclude = !targetPP || (scorePP >= targetPP && scorePP <= targetPP + 28);
                    }

                    if (shouldInclude) {
                        hasValidScore = true;
                        break;
                    }
                }

                if (hasValidScore) {
                    results = algorithmResults;
                    usedAlgorithm = algorithm;
                    break;
                }
            } else {
                Logger.service(`[WORKER] Algorithm ${algorithm} found no results, trying next...`);
            }
        }

        // Second pass: if no results, try with relaxed criteria
        if (!results || results.length === 0) {
            Logger.service(`[WORKER] No results with strict criteria, trying with relaxed filters...`);
            relaxedCriteria = true;

            for (const algorithm of algorithms) {
                const { min, max } = await computeRefinedGlobalPPRange(data.user.pp, top100Osu.tr, data.event.ids, sum, algorithm);

                const algorithmResults = await findScoresByPPRange({ min, max }, params.mods, data, params.bpm);

                if (algorithmResults && algorithmResults.length > 0) {
                    const targetPP = computeTargetPP(top100Osu.tr, sum);
                    let filtered = filterByMods(algorithmResults, params.mods, params.allowOtherMods);
                    filtered = filterOutTop100(filtered, top100Osu.table);
                    filtered = filtered.filter(score => score.precision < 10).sort((a, b) => b.precision - a.precision); // Relaxed precision

                    let hasValidScore = false;
                    for (const score of filtered) {
                        const scorePP = parseFloat(score.pp);
                        let shouldInclude = false;

                        if (params.pp !== null) {
                            const ppMargin = 25; // Relaxed PP margin
                            shouldInclude = Math.abs(scorePP - params.pp) <= ppMargin;
                        } else {
                            shouldInclude = !targetPP || (scorePP >= targetPP - 20 && scorePP <= targetPP + 50); // Relaxed PP range
                        }

                        if (shouldInclude) {
                            hasValidScore = true;
                            break;
                        }
                    }

                    if (hasValidScore) {
                        results = algorithmResults;
                        usedAlgorithm = algorithm;
                        break;
                    } else {
                        Logger.service(`[WORKER] Algorithm ${algorithm} found ${algorithmResults.length} results but none passed relaxed filters, trying next...`);
                    }
                }
            }
        }

        // Third pass: if still no results, accept any result from any algorithm
        if (!results || results.length === 0) {
            Logger.service(`[WORKER] No results with relaxed criteria, accepting ANY result...`);

            for (const algorithm of algorithms) {
                const { min, max } = await computeRefinedGlobalPPRange(data.user.pp, top100Osu.tr, data.event.ids, sum, algorithm);

                const algorithmResults = await findScoresByPPRange({ min, max }, params.mods, data, params.bpm);

                if (algorithmResults && algorithmResults.length > 0) {
                    let filtered = filterByMods(algorithmResults, params.mods, params.allowOtherMods);
                    filtered = filterOutTop100(filtered, top100Osu.table);

                    if (filtered.length > 0) {
                        results = algorithmResults;
                        usedAlgorithm = algorithm;
                        relaxedCriteria = true;
                        Logger.service(`[WORKER] Algorithm ${algorithm} found ${algorithmResults.length} results, accepting ANY valid score with FORCED relaxed criteria`);
                        break;
                    }
                }
            }
        }
        await metricsCollector.recordStepDuration(data.event.id, 'find_scores_by_pprange');

        if (results && results.length > 0 && userStats) {
            results.sort((a, b) => {
                const scoreA = calculatePreferenceScore(a, userStats);
                const scoreB = calculatePreferenceScore(b, userStats);
                return scoreB - scoreA;
            });
        }

        if (!results || results.length === 0) {
            const msg = await SendNotFoundBeatmapMessage(data.user.locale);
            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_NO_BEATMAP'
            });
            elapsed = Date.now() - startTime;
            await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, elapsed);
            await metricsCollector.updateCommandResult(data.event.id, 'not_beatmap');
            return;
        }

        const targetPP = computeTargetPP(top100Osu.tr, sum);
        await metricsCollector.recordStepDuration(data.event.id, 'compute_target_pp');

        let filtered = filterByMods(results, params.mods, params.allowOtherMods);
        await metricsCollector.recordStepDuration(data.event.id, 'filter_by_mods');
        filtered = filterOutTop100(filtered, top100Osu.table);
        await metricsCollector.recordStepDuration(data.event.id, 'filter_out_top_100');

        if (relaxedCriteria) {
            filtered = filtered.filter(score => score.precision < 10).sort((a, b) => b.precision - a.precision);
        } else {
            filtered = filtered.filter(score => score.precision < 8).sort((a, b) => b.precision - a.precision);
        }
        await metricsCollector.recordStepDuration(data.event.id, 'filter_scores');


        const sortList = [];

        for (const score of filtered) {
            const mapId = parseInt(score.beatmap_id);
            if (suggestions.includes(mapId.toString())) continue;

            const scorePP = parseFloat(score.pp);
            let shouldInclude = false;

            if (params.pp !== null) {
                const ppMargin = relaxedCriteria ? 25 : 15;
                shouldInclude = Math.abs(scorePP - params.pp) <= ppMargin;
            } else {
                if (relaxedCriteria) {
                    shouldInclude = true;
                } else {
                    shouldInclude = !targetPP || (scorePP >= targetPP && scorePP <= targetPP + 28);
                }
            }

            if (shouldInclude) {
                sortList.push(score);
            }
        }


        if (sortList.length === 0) {
            const msg = await SendNotFoundBeatmapMessage(data.user.locale);
            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_NO_BEATMAP'
            });
            elapsed = Date.now() - startTime;
            await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, elapsed);
            await metricsCollector.updateCommandResult(data.event.id, 'not_beatmap');
            return;
        }

        const selected = pickBestRandomPrecision(sortList);
        await metricsCollector.recordStepDuration(data.event.id, 'pick_best_random_precision');

        if (!selected) {
            const msg = await SendNotFoundBeatmapMessage(data.user.locale);
            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_NO_BEATMAP'
            });
            elapsed = Date.now() - startTime;
            await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, elapsed);
            await metricsCollector.updateCommandResult(data.event.id, 'not_beatmap');
            return;
        }

        var beatmap = null;
        if (!await redisStore.getBeatmap(selected.beatmap_id)) {
            beatmap = await osuApi.getBeatmap(selected.beatmap_id);
            await redisStore.recordBeatmap(beatmap);
        } else {
            beatmap = await redisStore.getBeatmap(selected.beatmap_id);
        }
        await metricsCollector.recordStepDuration(data.event.id, 'get_beatmap');

        if (!beatmap) {
            const msg = await SendNotFoundBeatmapMessage(data.user.locale);
            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_NO_BEATMAP'
            });
            elapsed = Date.now() - startTime;
            await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, elapsed);
            await metricsCollector.updateCommandResult(data.event.id, 'not_beatmap');
            return;
        }

        const response = await SendBeatmapMessage(data.user.locale, selected, beatmap, targetPP, params.unknownTokens, params.unsupportedMods, osuApi);
        const message = response.message;
        await redisStore.trackSuggestedBeatmap(selected.beatmap_id, data.user.id, beatmap.total_length, data.event.id);
        await db.saveSuggestion(data.user.id, selected.beatmap_id, data.event.id, targetPP, selected.mods);
        await metricsCollector.recordStepDuration(data.event.id, 'save_suggestion');

        Logger.service(`[WORKER] Successfully suggested beatmap using ${usedAlgorithm} algorithm${relaxedCriteria ? ' with RELAXED criteria' : ''}`);

        await metricsCollector.updateCommandResult(data.event.id, 'success');

        await redisStore.addSuggestion(selected.beatmap_id, data.user.id, selected.mods);
        await metricsCollector.recordStepDuration(data.event.id, 'add_suggestion_redis');

        elapsed = Date.now() - startTime;
        await db.saveCommandHistory(data.event.id, data.event.message, message, data.user.id, data.event.nick, true, elapsed, data.user.locale);
        await db.saveBeatmap(response.beatmap);
        await metricsCollector.recordStepDuration(data.event.id, 'save_command_history');

        process.send({
            username: data.event.nick,
            response: message,
            id: data.event.id,
            beatmapId: selected.beatmap_id,
            userId: data.user.id,
            success: true
        });

    } catch (e) {
        Logger.errorCatch('OSU Worker', e);

        try {
            await notifier.send(`OSU Worker Error: ${e.toString()}`, 'WORKER.OSU.FAIL');
        } catch (notifierError) {
            Logger.errorCatch('OSU Worker → Notifier Error', notifierError);
        }

        try {
            const locale = data.user?.locale || 'FR';
            const msg = getUserErrorMessage('ERR_WORKER_CRASH', locale);

            try {
                await metricsCollector.updateCommandResult(data.event.id, 'worker_crash');
            } catch (metricsError) {
                Logger.errorCatch('OSU Worker → Metrics Error', metricsError);
            }

            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: false,
                errorCode: 'ERR_WORKER_CRASH'
            });

            try {
                await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, 0);
            } catch (dbError) {
                Logger.errorCatch('OSU Worker → DB Error', dbError);
            }

        } catch (inner) {
            Logger.errorCatch('OSU Worker → Secondary Failure', inner);
            try {
                await notifier.send(`Double error in worker.o.js: ${inner.toString()}`, 'WORKER.OSU.FAIL2');
            } catch (notifierError2) {
                Logger.errorCatch('OSU Worker → Notifier Error 2', notifierError2);
            }
        }
    } finally {
        await redisStore.close();
        await metricsCollector.close();
        process.removeAllListeners('message');
        try { await db.disconnect(); } catch { }
        if (global.gc) global.gc();
        process.exit(0);
    }
});