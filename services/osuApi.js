const axios = require('axios');
const Performe = require('./Performe');

async function getUser(username, id) {

    if (!process.env.OSU_API_KEY) {
        throw new Error(`${new Date().toLocaleString('fr-FR')} ${id} Missing OSU_API_KEY in environment variables.`);
    }
    const performe = new Performe();
    await performe.init();
    const t = performe.startTimer();
    const { data } = await axios.get(`https://osu.ppy.sh/api/get_user?k=${process.env.OSU_API_KEY}&u=${username}&m=0`);
    await performe.logCommand(await t.stop('GETUSER'), 'GETUSER')
    await performe.close();
    return {
        locale: data[0].country,
        id: parseInt(data[0].user_id),
        username: data[0].username,
        pp: parseInt(data[0].pp_raw)
    };
}
async function getTop100(userId, id) {
    if (!process.env.OSU_API_KEY) {
        throw new Error(`${new Date().toLocaleString('fr-FR')} ${id}Missing OSU_API_KEY in environment variables.`);
    }
    const performe = new Performe();
    await performe.init();
    const t = performe.startTimer();
    const params = {
        k: process.env.OSU_API_KEY,
        u: userId,
        limit: 100
    };

    const response = await axios.get('https://osu.ppy.sh/api/get_user_best', { params });
    const rawScores = response.data || [];
    await performe.logCommand(await t.stop('GETTOP'), 'GETTOP')
    await performe.close();

    const scores = rawScores.map((entry, index) => ({
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

    return {
        table: existingMapIds,
        tr: rawScores,
        possibles: gainCandidates
    };
}


async function getBeatmap(bid) {
    if (!process.env.OSU_API_KEY) {
        throw new Error(`${new Date().toLocaleString('fr-FR')} Missing OSU_API_KEY in environment variables.`);
    }
    const performe = new Performe();
    await performe.init();
    const t = performe.startTimer();
    const { data } = await axios.get(`https://osu.ppy.sh/api/get_beatmaps?k=${process.env.OSU_API_KEY}&b=${bid}`);
    await performe.logCommand(await t.stop('GETMAP'), 'GETMAP')
    await performe.close();
    return data[0];
}
module.exports = { getUser, getTop100, getBeatmap };
