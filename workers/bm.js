const Performe = require('../services/Performe');
require('dotenv').config();

const computeRefinedGlobalPPRange = require('../compute/RefinedGlobalPPRange');
const findScoresByPPRange = require('../compute/findScoreByPPRange');

const { SendBeatmapMessage, SendNotFoundBeatmapMessage } = require('../utils/messages');

const modsToBitwise = require('../utils/osu/modsToBitwise');
const parseCommandParameters = require('../utils/parser/bmParser');

const { getTop100, getBeatmap } = require('../services/osuApi');

const Thread2Database = require('../services/SQL');


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
    const db = new Thread2Database();
    await db.connect();
    const startTime = Date.now();
    const performe = new Performe();
    performe.init();
    const t = performe.startTimer();

    let sortList
    let filtered
    let sug
    let selected = null;
    let beatmap = null;
    let results = null;
    let top100Set = null;

    try {

        console.log(`[Worker] ${new Date().toLocaleString('fr-FR')} ${data.event.id} Starting processing...`);
        const params = parseCommandParameters(data.event.message);

        sug = await db.getSug(data.user.id);
        let top100Set = await getTop100(data.user.id, data.event.id);
        const { min, max } = await computeRefinedGlobalPPRange(data.user.pp, top100Set.tr, data.event.id);
        results = await findScoresByPPRange({ min, max }, params.mods, data);

        filtered = filterByMods(results, params.mods, params.allowOtherMods);
        const targetPP = top100Set.possibles[0] ? top100Set.possibles[0].brut - 20.25 : null;

        filtered = filterOutTop100(filtered, top100Set.table);
        filtered = filtered
            .filter(score => score.precision < 8)
            .sort((a, b) => b.precision - a.precision);


        const now = Date.now();

        sortList = [];
        selected = null;


        const t2 = performe.startTimer();
        for (let i = 0; i < filtered.length; i++) {
            const score = filtered[i];
            const mapId = parseInt(score.beatmap_id);
            const previous = sug.find(e => e.beatmap_id === mapId);

            const isOld = previous && (now - new Date(previous.Date).getTime()) > 7 * 24 * 60 * 60 * 1000;
            const isNotInList = !previous;

            if (isOld || isNotInList) {
                if (targetPP) {
                    const pp = parseFloat(score.pp);
                    if (pp >= targetPP && pp <= targetPP + 28) {
                        sortList.push(score);
                        selected = score;
                    }
                } else {
                    sortList.push(score);
                    break;
                }
            }
        }
        selected = pickBestRandomPrecision(sortList);
        await performe.logDuration('SORTBM', await t2.stop('SORTBM'))
        if (!selected) {
            const elapsedTime = Date.now() - startTime;
            const message = SendNotFoundBeatmapMessage(data.user.country, elapsedTime);
            process.send({ username: data.event.nick, response: message, uid: data.event.id });
            await db.setHistory(data.event.id, data.event.message, message, data.user.id, data.event.nick, false, elapsedTime);
            await db.disconnect();
            process.exit(0);
        }
        const beatmap = await getBeatmap(selected.beatmap_id);
        const elapsedTime = Date.now() - startTime;
        const responseMessage = SendBeatmapMessage(data.user.locale, selected, beatmap, targetPP, elapsedTime);
        await performe.logDuration('BM', await t.stop('BM'))
        await performe.logCommand(data.user.id, 'BM')
        await performe.close();
        process.send({ username: data.event.nick, response: responseMessage, uid: data.event.id, beatmapId: selected.beatmap_id, userId: data.user.id });
        await db.setSug(data.user.id, selected.beatmap_id);
        await db.setHistory(data.event.id, data.event.message, responseMessage, data.user.id, data.event.nick, true, elapsedTime, data.user.locale);
        await db.disconnect();

    } catch (e) {
        await performe.logDuration('BM', await t.stop('BM'))
        await performe.logCommand(data.user.id, 'BM')
        await performe.close();
        console.error(e);
        const elapsedTime = Date.now() - startTime;
        await db.setHistory(data.event.id, data.event.message, 'Error', data.user.id, data.event.nick, false, elapsedTime);
        await db.disconnect();

    } finally {

        sortList = null;
        filtered = null;
        sug = null;
        selected = null;
        beatmap = null;
        results = null;
        top100Set = null;

        process.removeAllListeners();

        if (global.gc) global.gc();

        setTimeout(() => process.exit(0), 50);
    }

});