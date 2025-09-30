const Logger = require('../utils/Logger');
const RedisStore = require('../services/RedisStore');
const Thread2Database = require('../services/SQL');
const MetricsCollector = require('../services/MetricsCollector');
const Notifier = require('../services/Notifier');
const OsuApiClient = require('../services/OsuApis/Client');
const { SendBeatmapMessage, SendNotFoundBeatmapMessage } = require('../utils/messages');
const { getUserErrorMessage } = require('../utils/UserFacingError');
const parseCommandParameters = require('../utils/parser/commandParser');
const computeCrossModeProgressionPotential = require('../compute/osu/CrossModeProgressionPotential');
const computeTargetPP = require('../compute/osu/targetPP');
const { analyzeUserMods } = require('../utils/osu/analyzeUserMods');
const analyzeUserPreferences = require('../utils/osu/analyzeUserPreferences');
const { calculatePreferenceScore } = require('../utils/osu/PreferencesScorer');
const { filterOutTop100, filterByMods, pickBestRandomPrecision } = require('../utils/osu/ScoreFilters');
const AlgorithmManager = require('../managers/AlgorithmManager');
const UserPreferencesManager = require('../managers/UserPreferencesManager');

const osuApi = new OsuApiClient('http://localhost:25586');
const notifier = new Notifier();
const algorithmManager = new AlgorithmManager();
const userPreferencesManager = new UserPreferencesManager();

let GlobalData;

process.on('message', async (data) => {
    GlobalData = data;

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
        await userPreferencesManager.init();
        const user = data.user;
        const userPreferences = await userPreferencesManager.getUserPreferences(user.id);
        const params = parseCommandParameters(data.event.message, 'osu', userPreferences);
        const event = data.event;

        let top100 = await redisStore.getTop100(user.id);
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
        const suggestions = await redisStore.getUserSuggestions(data.user.id);

        const userModsAnalysis = analyzeUserMods(top100Osu.tr);
        if (userModsAnalysis) {
            await redisStore.setUserModsAnalysis(data.user.id, userModsAnalysis, 3600);
        }

        const userStats = analyzeUserPreferences(top100Osu.tr);

        const sum = computeCrossModeProgressionPotential(data.user.id, top100);
        await metricsCollector.recordStepDuration(data.event.id, 'compute_cross_mode_progression_potential');

        const targetPP = computeTargetPP(top100Osu.tr, sum);

        const algorithmResult = await algorithmManager.executeAlgorithmStrategy({
            userPP: data.user.pp,
            top100OsuTr: top100Osu.tr,
            eventId: data.event.id,
            sum,
            mods: params.mods,
            bpm: params.bpm,
            data: { top100, user: data.user },
            allowOtherMods: params.allowOtherMods,
            targetPP: params?.pp ? params.pp : targetPP,
            algorithm: params.algorithm
        });

        await metricsCollector.recordStepDuration(data.event.id, 'find_scores_by_pprange');

        if (!algorithmResult.results || algorithmResult.results.length === 0) {
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

        await metricsCollector.recordStepDuration(data.event.id, 'compute_target_pp');

        if (algorithmResult.results && algorithmResult.results.length > 0 && userStats) {
            algorithmResult.results.sort((a, b) => {
                const scoreA = calculatePreferenceScore(a, userStats);
                const scoreB = calculatePreferenceScore(b, userStats);
                return scoreB - scoreA;
            });
        }

        let filtered = filterByMods(algorithmResult.results, params.mods, params.allowOtherMods);
        await metricsCollector.recordStepDuration(data.event.id, 'filter_by_mods');
        filtered = filterOutTop100(filtered, top100Osu.table);
        await metricsCollector.recordStepDuration(data.event.id, 'filter_out_top_100');

        if (algorithmResult.relaxedCriteria) {
            filtered = filtered.filter(score => score.precision < 10).sort((a, b) => b.precision - a.precision);
        } else {
            filtered = filtered.filter(score => score.precision < 8).sort((a, b) => b.precision - a.precision);
        }
        await metricsCollector.recordStepDuration(data.event.id, 'filter_scores');

        const sortList = [];

        for (const score of filtered) {
            const mapId = parseInt(score.beatmap_id);
            if (suggestions.includes(mapId.toString())) continue;

            const beatmap = await redisStore.getBeatmap(mapId);
            if (beatmap) {
                const mapper = beatmap.creator?.toLowerCase() || '';
                const title = beatmap.title?.toLowerCase() || '';

                if (userPreferences.mapperBan && userPreferences.mapperBan.length > 0 &&
                    userPreferences.mapperBan.some(bannedMapper =>
                        mapper.includes(bannedMapper.toLowerCase())
                    )) {
                    continue;
                }

                if (userPreferences.titleBan && userPreferences.titleBan.length > 0 &&
                    userPreferences.titleBan.some(bannedTitle =>
                        title.includes(bannedTitle.toLowerCase())
                    )) {
                    continue;
                }
            }

            const scorePP = parseFloat(score.pp);
            let shouldInclude = false;

            if (params.pp !== null) {
                const ppMargin = algorithmResult.relaxedCriteria ? 25 : 15;
                shouldInclude = Math.abs(scorePP - params.pp) <= ppMargin;
            } else {
                if (algorithmResult.relaxedCriteria) {
                    shouldInclude = true;
                } else {
                    shouldInclude = !params.pp || (scorePP >= params.pp && scorePP <= params.pp + 28);
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
            const response = await SendNotFoundBeatmapMessage(user.locale);
            process.send({ type: 'result', success: false, message: response.message, id: event.id });
            await db.saveCommandHistory(data.event.id, data.event.message, response.message, data.user.id, data.event.nick, false, 0);
            await metricsCollector.updateCommandResult(data.event.id, 'not_beatmap');
            return;
        }

        const response = await SendBeatmapMessage(data.user.locale, selected, beatmap, targetPP, params.unknownTokens, params.unsupportedMods, osuApi);
        const message = response.message;
        await redisStore.trackSuggestedBeatmap(selected.beatmap_id, data.user.id, beatmap.total_length, data.event.id);
        await db.saveSuggestion(data.user.id, selected.beatmap_id, data.event.id, targetPP, selected.mods, algorithmResult.algorithm);
        await metricsCollector.recordStepDuration(data.event.id, 'save_suggestion');

        Logger.service(`[WORKER] Successfully suggested beatmap using ${algorithmResult.algorithm} algorithm${algorithmResult.relaxedCriteria ? ' with RELAXED criteria' : ''}`);

        await metricsCollector.updateCommandResult(data.event.id, 'success');

        await redisStore.addSuggestion(selected.beatmap_id, data.user.id, selected.mods, algorithmResult.algorithm);
        await metricsCollector.recordStepDuration(data.event.id, 'add_suggestion_redis');

        process.send({
            username: data.event.nick,
            response: message,
            id: data.event.id,
            beatmapId: selected.beatmap_id,
            userId: data.user.id,
            success: true
        });

        elapsed = Date.now() - startTime;
        await db.saveCommandHistory(data.event.id, data.event.message, message, data.user.id, data.event.nick, true, elapsed, data.user.locale);
        await db.saveBeatmap(response.beatmap);
        await metricsCollector.recordStepDuration(data.event.id, 'save_command_history');

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
        await userPreferencesManager.close();
        process.removeAllListeners('message');
        try { await db.disconnect(); } catch { }
        if (global.gc) global.gc();
        process.exit(0);
    }
});