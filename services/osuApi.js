const axios = require('axios');
const RedisStore = require('./RedisStore');
const MetricsCollector = require('./MetricsCollector');

async function getUser(username, id) {
    if (!process.env.OSU_API_KEY) {
        throw new Error(`${new Date().toLocaleString('fr-FR')} ${id} Missing OSU_API_KEY in environment variables.`);
    }

    const performe = new RedisStore();
    const metricsCollector = new MetricsCollector();
    const startTime = Date.now();

    try {
        await performe.init();
        await metricsCollector.init();

        // Check Redis cache first (try both username and id as keys)
        let cachedProfile = await performe.getCachedProfile(id || username);
        if (!cachedProfile && username !== id) {
            // Try with the other parameter as key
            cachedProfile = await performe.getCachedProfile(username === id ? username : (id || username));
        }

        if (cachedProfile) {
            const duration = Date.now() - startTime;
            await metricsCollector.recordServicePerformance('api', 'getUser', duration, 'osuApi_cache');
            console.log(`osuApi: Profile cache hit for user ${id || username}: ${cachedProfile.username}`);
            return cachedProfile;
        }

        // Cache miss - fetch from API
        console.log(`osuApi: Profile cache miss for user ${id || username}, fetching from API`);

        const t = performe.startTimer();
        const { data } = await axios.get(`https://osu.ppy.sh/api/get_user?k=${process.env.OSU_API_KEY}&u=${username}&m=0`);
        const duration = await t.stop('GETUSER');

        const profileData = {
            locale: data[0].country,
            id: parseInt(data[0].user_id),
            username: data[0].username,
            pp: parseInt(data[0].pp_raw)
        };

        // Cache the profile data with both username and id as keys
        await performe.setCachedProfile(profileData.id, profileData);
        await performe.setCachedProfile(profileData.username, profileData);

        await metricsCollector.recordServicePerformance('api', 'getUser', duration, 'osuApi');

        return profileData;
    } finally {
        await performe.close();
        await metricsCollector.close();
    }
}
async function getTop100MultiMods(userId, id) {
    if (!process.env.OSU_API_KEY) {
        throw new Error(`${new Date().toLocaleString('fr-FR')} ${id} Missing OSU_API_KEY in environment variables.`);
    }

    const modes = ['0', '1', '2', '3'];
    const modeNames = ['osu', 'taiko', 'catch', 'mania'];
    const performe = new RedisStore();
    const metricsCollector = new MetricsCollector();
    let duration = null;

    try {
        await performe.init();
        await metricsCollector.init();

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

            results[modeName] = {
                table: existingMapIds,
                tr: rawScores,
                possibles: gainCandidates
            };
        }

        duration = await t.stop('GETTOP_ALL_MODES');
        await metricsCollector.recordServicePerformance('api', 'getTop100MultiMods', duration, 'osuApi');

        return results;
    } finally {
        await performe.close();
        await metricsCollector.close();
    }
}



async function getBeatmap(bid) {
    if (!process.env.OSU_API_KEY) {
        throw new Error(`${new Date().toLocaleString('fr-FR')} Missing OSU_API_KEY in environment variables.`);
    }

    const performe = new RedisStore();
    const metricsCollector = new MetricsCollector();
    let duration = null;

    try {
        await performe.init();
        await metricsCollector.init();

        const t = performe.startTimer();
        const { data } = await axios.get(`https://osu.ppy.sh/api/get_beatmaps?k=${process.env.OSU_API_KEY}&b=${bid}`);
        duration = await t.stop('GETMAP');

        await metricsCollector.recordServicePerformance('api', 'getBeatmap', duration, 'osuApi');

        return data[0];
    } finally {
        await performe.close();
        await metricsCollector.close();
    }
}
module.exports = { getUser, getTop100MultiMods, getBeatmap };
