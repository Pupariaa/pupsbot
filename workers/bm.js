const Performe = require('../services/Performe');
require('dotenv').config();

const computeRefinedGlobalPPRange = require('../compute/RefinedGlobalPPRange');
const findScoresByPPRange = require('../compute/findScoreByPPRange');
const computeCrossModeProgressionPotential = require('../compute/CrossModeProgressionPotential');
const computeTargetPP = require('../compute/targetPP');

const { SendBeatmapMessage, SendNotFoundBeatmapMessage } = require('../utils/messages');

const modsToBitwise = require('../utils/osu/modsToBitwise');
const parseCommandParameters = require('../utils/parser/bmParser');

const { getTop100MultiMods, getBeatmap } = require('../services/OsuApiV1');

const Thread2Database = require('../services/SQL');
const Logger = require('../utils/Logger');

const Notifier = require('../services/Notifier');
const notifier = new Notifier();

const { getUserErrorMessage } = require('../utils/UserFacingError');

let GlobalData = null;

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
    const performe = new Performe();

    try {
        await db.connect();
        await performe.init();
        const t = performe.startTimer();
        const startTime = Date.now();
        const params = parseCommandParameters(data.event.message);
        const suggestions = await performe.getUserSuggestions(data.user.id);
        const top100 = await getTop100MultiMods(data.user.id, data.event.id);
        const top100Osu = top100.osu;
        const sum = computeCrossModeProgressionPotential(data.user.id, top100);

        const { min, max } = await computeRefinedGlobalPPRange(data.user.pp, top100Osu.tr, data.event.ids, sum);
        const results = await findScoresByPPRange({ min, max }, params.mods, data);
        const targetPP = computeTargetPP(top100Osu.tr, sum);

        let filtered = filterByMods(results, params.mods, params.allowOtherMods);
        filtered = filterOutTop100(filtered, top100Osu.table)
            .filter(score => score.precision < 8)
            .sort((a, b) => b.precision - a.precision);

        const t2 = performe.startTimer();
        const sortList = [];

        for (const score of filtered) {
            const mapId = parseInt(score.beatmap_id);
            if (suggestions.includes(mapId.toString())) continue;

            if (!targetPP || (parseFloat(score.pp) >= targetPP && parseFloat(score.pp) <= targetPP + 28)) {
                sortList.push(score);
            }
        }

        await performe.logDuration('SORTBM', await t2.stop('SORTBM'));

        const selected = pickBestRandomPrecision(sortList);

        if (!selected) {
            const elapsed = Date.now() - startTime;
            const msg = getUserErrorMessage('ERR_NO_BEATMAP', data.user.locale);
            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_NO_BEATMAP'
            });
            await db.setHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, elapsed);
            return;
        }

        const beatmap = await getBeatmap(selected.beatmap_id);
        const elapsed = Date.now() - startTime;
        const response = SendBeatmapMessage(data.user.locale, selected, beatmap, targetPP, params.unknownTokens, params.unsupportedMods);

        await performe.logDuration('BM', await t.stop('BM'));
        await performe.logCommand(data.user.id, 'BM');
        await performe.trackSuggestedBeatmap(selected.beatmap_id, data.user.id, beatmap.total_length, data.event.id);

        process.send({
            username: data.event.nick,
            response,
            id: data.event.id,
            beatmapId: selected.beatmap_id,
            userId: data.user.id,
            success: true
        });

        await db.setSug(data.user.id, selected.beatmap_id, data.event.id, selected.pp);
        await performe.addSuggestion(selected.beatmap_id, data.user.id);
        await db.saveCommandHistory(data.event.id, data.event.message, response, data.user.id, data.event.nick, true, elapsed, data.user.locale);
    } catch (e) {
        Logger.errorCatch('Bm Worker', e);
        await notifier.send(`BM Worker Error: ${e.toString()}`, 'WORKER.BM.FAIL');

        try {
            const locale = data.user?.locale || 'FR';
            const msg = getUserErrorMessage('ERR_WORKER_CRASH', locale);

            await performe.logDuration('BM', 0);
            await performe.logCommand(data.user.id, 'BM');
            await performe.close();

            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_WORKER_CRASH'
            });

            await db.setHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, 0);
        } catch (inner) {
            Logger.errorCatch('Bm Worker → Secondary Failure', inner);
            await notifier.send(`Double error in worker.bm.js: ${inner.toString()}`, 'WORKER.BM.FAIL2');
        }
    } finally {
        await performe.close();
        process.removeAllListeners('message');
        try { await db.disconnect(); } catch { }
        if (global.gc) global.gc();
        process.exit(0);
    }
});
