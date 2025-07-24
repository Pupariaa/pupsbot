const axios = require('axios');
const Performe = require('./Performe');
const Notifier = require('../services/Notifier');
const notifier = new Notifier();

async function getUser(username, id) {
    if (!process.env.OSU_API_KEY) {
        const msg = `${new Date().toLocaleString('fr-FR')} ${id} Missing OSU_API_KEY in environment variables.`;
        await notifier.send(msg, 'OSUAPI.GETUSER');
        throw new Error(msg);
    }

    const performe = new Performe();
    let duration = null;

    try {
        await performe.init();
        const t = performe.startTimer();
        const { data } = await axios.get(`https://osu.ppy.sh/api/get_user?k=${process.env.OSU_API_KEY}&u=${username}&m=0`);
        duration = await t.stop('GETUSER');

        return {
            locale: data[0].country,
            id: parseInt(data[0].user_id),
            username: data[0].username,
            pp: parseInt(data[0].pp_raw)
        };
    } catch (err) {
        await notifier.send(`Erreur getUser(${username}) [${id}] : ${err.message}`, 'OSUAPI.GETUSER');
        throw err;
    } finally {
        if (duration !== null) await performe.logDuration('GETUSER', duration);
        await performe.close();
    }
}

async function getTop100MultiMods(userId, id) {
    if (!process.env.OSU_API_KEY) {
        const msg = `${new Date().toLocaleString('fr-FR')} ${id} Missing OSU_API_KEY in environment variables.`;
        await notifier.send(msg, 'OSUAPI.GETTOP');
        throw new Error(msg);
    }

    const modes = ['0', '1', '2', '3'];
    const modeNames = ['osu', 'taiko', 'catch', 'mania'];
    const performe = new Performe();
    let duration = null;

    try {
        await performe.init();
        const t = performe.startTimer();
        const results = {};

        for (let i = 0; i < modes.length; i++) {
            const mode = modes[i];
            const modeName = modeNames[i];

            const params = {
                k: process.env.OSU_API_KEY,
                u: userId,
                m: mode,
                limit: 100
            };

            const response = await axios.get('https://osu.ppy.sh/api/get_user_best', { params });
            const rawScores = response.data || [];

            const scores = rawScores.map(entry => ({
                beatmap_id: parseInt(entry.beatmap_id, 10),
                date: new Date(entry.date),
                raw_pp: parseFloat(entry.pp)
            }));

            const existingMapIds = new Set(scores.map(score => score.beatmap_id));
            const baseWeightedPP = scores.reduce(
                (total, score, index) => total + score.raw_pp * Math.pow(0.95, index),
                0
            );

            const gainCandidates = [];

            for (let pp = 5; pp <= 2000; pp += pp < 500 ? 1 : (pp < 1000 ? 5 : 10)) {
                if (pp <= scores[99]?.raw_pp) continue;

                const hypothetical = [...scores, { raw_pp: pp }];
                const top100 = hypothetical
                    .sort((a, b) => b.raw_pp - a.raw_pp)
                    .slice(0, 100);

                const newTotalPP = top100.reduce(
                    (sum, score, index) => sum + score.raw_pp * Math.pow(0.95, index),
                    0
                );

                const gain = newTotalPP - baseWeightedPP;
                const rank = top100.findIndex(score => score.raw_pp === pp);

                if (rank === -1) continue;
                if (gain >= 20) {
                    gainCandidates.push({
                        brut: pp,
                        position: rank + 1,
                        gain: parseFloat(gain.toFixed(2)),
                        newTotal: parseFloat(newTotalPP.toFixed(2))
                    });
                }
            }

            results[modeName] = {
                table: existingMapIds,
                tr: rawScores,
                possibles: gainCandidates
            };
        }

        duration = await t.stop('GETTOP_ALL_MODES');
        return results;
    } catch (err) {
        await notifier.send(`Erreur getTop100MultiMods(${userId}) : ${err.message}`, 'OSUAPI.GETTOP');
        throw err;
    } finally {
        if (duration !== null) await performe.logDuration('GETTOP_ALL_MODES', duration);
        await performe.close();
    }
}

async function getBeatmap(bid) {
    if (!process.env.OSU_API_KEY) {
        const msg = `${new Date().toLocaleString('fr-FR')} Missing OSU_API_KEY in environment variables.`;
        await notifier.send(msg, 'OSUAPI.GETMAP');
        throw new Error(msg);
    }

    const performe = new Performe();
    let duration = null;

    try {
        await performe.init();
        const t = performe.startTimer();
        const { data } = await axios.get(`https://osu.ppy.sh/api/get_beatmaps?k=${process.env.OSU_API_KEY}&b=${bid}`);
        duration = await t.stop('GETMAP');
        return data[0];
    } catch (err) {
        await notifier.send(`Erreur getBeatmap(${bid}) : ${err.message}`, 'OSUAPI.GETMAP');
        throw err;
    } finally {
        if (duration !== null) await performe.logDuration('GETMAP', duration);
        await performe.close();
    }
}

module.exports = { getUser, getTop100MultiMods, getBeatmap };
