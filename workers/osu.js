const Logger = require('../utils/Logger');
const RedisStore = require('../services/RedisStore');
const Thread2Database = require('../services/SQL');
const MetricsCollector = require('../services/MetricsCollector');
const Notifier = require('../services/Notifier');
const OsuApiWrapper = require('../services/OsuApiWrapper');
const { SendBeatmapMessage, SendNotFoundBeatmapMessage } = require('../utils/messages');
const { getUserErrorMessage } = require('../utils/UserFacingError');
const parseCommandParameters = require('../utils/parser/bmParser');
const computeRefinedGlobalPPRange = require('../compute/osu/RefinedGlobalPPRange');
const findScoresByPPRange = require('../compute/osu/findScoreByPPRange');
const computeCrossModeProgressionPotential = require('../compute/osu/CrossModeProgressionPotential');
const computeTargetPP = require('../compute/osu/targetPP');
const modsToBitwise = require('../utils/osu/modsToBitwise');

const osuApi = new OsuApiWrapper();
const notifier = new Notifier();

let GlobalData;

function filterOutTop100(results, beatmapIdSet) {
    return results.filter(score => !beatmapIdSet.has(parseInt(score.beatmap_id, 10)));
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
        const top100 = await osuApi.getTop100MultiMods(data.user.id, data.event.id);
        await metricsCollector.recordStepDuration(data.event.id, 'get_top100');

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
        const sum = computeCrossModeProgressionPotential(data.user.id, top100);
        await metricsCollector.recordStepDuration(data.event.id, 'compute_cross_mode_progression_potential');

        const { min, max } = await computeRefinedGlobalPPRange(data.user.pp, top100Osu.tr, data.event.ids, sum);
        await metricsCollector.recordStepDuration(data.event.id, 'compute_refined_global_pprange');
        const results = await findScoresByPPRange({ min, max }, params.mods, data, params.bpm);
        await metricsCollector.recordStepDuration(data.event.id, 'find_scores_by_pprange');

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
        filtered = filtered.filter(score => score.precision < 8).sort((a, b) => b.precision - a.precision);
        await metricsCollector.recordStepDuration(data.event.id, 'filter_scores');

        if (filtered.length === 0) {
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

        const selected = pickBestRandomPrecision(filtered);
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

        const response = await SendBeatmapMessage(data.user.locale, selected, beatmap, targetPP, params.unknownTokens, params.unsupportedMods);
        await redisStore.trackSuggestedBeatmap(selected.beatmap_id, data.user.id, beatmap.total_length, data.event.id);
        await db.saveSuggestion(data.user.id, selected.beatmap_id, data.event.id, targetPP);
        await metricsCollector.recordStepDuration(data.event.id, 'save_suggestion');

        await metricsCollector.updateCommandResult(data.event.id, 'success');

        await redisStore.addSuggestion(selected.beatmap_id, data.user.id);
        await metricsCollector.recordStepDuration(data.event.id, 'add_suggestion_redis');

        elapsed = Date.now() - startTime;
        await db.saveCommandHistory(data.event.id, data.event.message, response, data.user.id, data.event.nick, true, elapsed, data.user.locale);
        await metricsCollector.recordStepDuration(data.event.id, 'save_command_history');

        process.send({
            username: data.event.nick,
            response,
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