const Performe = require('../services/Performe');
require('dotenv').config();

const computeCrossModeProgressionPotential = require('../compute/CrossModeProgressionPotential');
const osu_utils = require('osu-utils');
const { SendBeatmapMessage, SendNotFoundBeatmapMessage } = require('../utils/messages');
const BuildPrompt = require('../compute/BuildPrompIA');
const { OpenAI } = require('openai');

const { getTop100MultiMods } = require('../services/OsuApiV1');

const Thread2Database = require('../services/SQL');
const Logger = require('../utils/Logger');
const osuUtils = new osu_utils();

function transformScores(rawArray) {
    return rawArray.map(entry => {
        const bmid = entry.beatmap_id;
        const score = parseInt(entry.score);
        const maxcombo = parseInt(entry.maxcombo);
        const mods = osuUtils.ModsIntToString(parseInt(entry.enabled_mods));
        const date = entry.date;
        const rank = entry.rank;
        const pp = parseFloat(entry.pp);

        const h0 = parseInt(entry.countmiss);
        const h1 = parseInt(entry.count100);
        const h5 = parseInt(entry.count50);
        const h3 = parseInt(entry.count300);
        const k = parseInt(entry.countkatu || 0);
        const g = parseInt(entry.countgeki || 0);

        const accuracy = osuUtils.CalcAccuracy(0, h3, h1, h5, h0, k, g);

        return {
            bmid,
            score,
            maxcombo,
            mods,
            date,
            rank,
            pp,
            acc: accuracy
        };
    });
}

let GlobalData = null;

process.on('message', async (data) => {
    GlobalData = data;
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });



    const db = new Thread2Database();
    const performe = new Performe();

    try {
        await db.connect();
        await performe.init();
        const t = performe.startTimer();
        const startTime = Date.now();

        const top100 = await getTop100MultiMods(data.user.id, data.event.id);
        const sum = computeCrossModeProgressionPotential(data.user.id, top100);
        const top100Osu = top100.osu;
        const cleaned = transformScores(top100Osu.tr);

        console.log(sum)

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: BuildPrompt(cleaned, data.user.locale, sum) }],
            temperature: 0.8
        });
        console.log(cleaned)

        const reply = completion.choices[0].message.content;

        try {
            const parsed = JSON.parse(reply);
            console.log(parsed.lines);
            return parsed.lines;
        } catch (err) {
            console.error('Invalid JSON:', reply);
            return null;
        }



        const elapsed = Date.now() - startTime;
        // const response = SendBeatmapMessage(data.user.locale, selected, beatmap, targetPP, params.unknownTokens, params.unsupportedMods);

        // await performe.logDuration('BM', await t.stop('BM'));
        // await performe.logCommand(data.user.id, 'BM');


        // process.send({
        //     username: data.event.nick,
        //     response,
        //     id: data.event.id,
        //     beatmapId: selected.beatmap_id,
        //     userId: data.user.id
        // });

        // await db.setSug(data.user.id, selected.beatmap_id);
        // await db.setHistory(data.event.id, data.event.message, response, data.user.id, data.event.nick, true, elapsed, data.user.locale);

    } catch (e) {
        Logger.errorCatch('Bm Worker', e);
        try {
            const response = SendNotFoundBeatmapMessage(data.user.country, 0);
            const elapsed = Date.now() - Date.now();
            await performe.logDuration('BM', 0);
            await performe.logCommand(data.user.id, 'BM');
            await performe.close();
            process.send({
                username: data.event.nick,
                response,
                id: data.event.id,
                beatmapId: null,
                userId: data.user.id,
                success: false
            });
            await db.setHistory(data.event.id, data.event.message, 'Error', data.user.id, data.event.nick, false, elapsed);
        } catch (err) {
            Logger.errorCatch('Bm Worker', err);
        }
    } finally {
        await performe.close();
        process.removeAllListeners('message');
        try { await db.disconnect(); } catch { }
        if (global.gc) global.gc();
        process.exit(0);

    }
});
