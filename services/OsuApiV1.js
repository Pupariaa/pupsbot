const axios = require('axios');
const RedisStore = require('./RedisStore');
const Logger = require('../utils/Logger');
const Notifier = require('../services/Notifier');
const MetricsCollector = require('./MetricsCollector');
const notifier = new Notifier();

async function getUser(username, id) {
    if (!process.env.OSU_API_KEY) {
        const msg = `${new Date().toLocaleString('fr-FR')} ${id} Missing OSU_API_KEY in environment variables.`;
        await notifier.send(msg, 'OSUAPI.GETUSER');
        throw new Error(msg);
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
            await metricsCollector.recordServicePerformance('api', 'getUser', duration, 'v1_cache');
            Logger.service(`OsuApiV1: Profile cache hit for user ${id || username}: ${cachedProfile.username}`);
            return cachedProfile;
        }

        // Cache miss - fetch from API
        Logger.service(`OsuApiV1: Profile cache miss for user ${id || username}, fetching from API`);

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

        await metricsCollector.recordServicePerformance('api', 'getUser', duration, 'v1');

        return profileData;
    } catch (err) {
        await notifier.send(`Erreur getUser(${username}) [${id}] : ${err.message}`, 'OSUAPI.GETUSER');
        throw err;
    } finally {
        await performe.close();
        await metricsCollector.close();
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
        await metricsCollector.recordServicePerformance('api', 'getTop100MultiMods', duration, 'v1');

        return results;
    } catch (err) {
        await notifier.send(`Erreur getTop100MultiMods(${userId}) : ${err.message}`, 'OSUAPI.GETTOP');
        throw err;
    } finally {
        await performe.close();
        await metricsCollector.close();
    }
}

async function getBeatmap(bid) {
    if (!process.env.OSU_API_KEY) {
        const msg = `${new Date().toLocaleString('fr-FR')} Missing OSU_API_KEY in environment variables.`;
        await notifier.send(msg, 'OSUAPI.GETMAP');
        throw new Error(msg);
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

        await metricsCollector.recordServicePerformance('api', 'getBeatmap', duration, 'v1');

        return data[0];
    } catch (err) {
        await notifier.send(`Erreur getBeatmap(${bid}) : ${err.message}`, 'OSUAPI.GETMAP');
        throw err;
    } finally {
        await performe.close();
        await metricsCollector.close();
    }
}

async function hasUserPlayedMap(userId, beatmapId) {
    if (!process.env.OSU_API_KEY) {
        Logger.errorCatch('OsuApiV1', 'Missing OSU_API_KEY in environment variables.');
        return false;
    }

    const metricsCollector = new MetricsCollector();
    const startTime = Date.now();

    try {
        await metricsCollector.init();

        const params = {
            k: process.env.OSU_API_KEY,
            u: userId,
            b: beatmapId,
            limit: 100,
            m: 0
        };

        const response = await axios.get('https://osu.ppy.sh/api/get_scores', { params });
        const scores = response.data;

        if (!Array.isArray(scores) || scores.length === 0) {
            return false;
        }

        const latestScore = scores[0];
        return {
            date: latestScore.date,
            pp: parseFloat(latestScore.pp) || 0,
            score: latestScore.score,
            maxcombo: latestScore.maxcombo,
            rank: latestScore.rank,
            enabled_mods: latestScore.enabled_mods
        };
    } catch (err) {
        Logger.errorCatch('OsuApiV1', `Error checking if user played beatmap ${beatmapId}`, err);
        return false;
    } finally {
        const duration = Date.now() - startTime;
        await metricsCollector.recordServicePerformance('api', 'hasUserPlayedMap', duration, 'v1');
        await metricsCollector.close();
    }
}

module.exports = { getUser, getTop100MultiMods, getBeatmap, hasUserPlayedMap };
