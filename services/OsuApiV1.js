const axios = require('axios');
const Logger = require('../utils/Logger');
const ErrorHandler = require('../utils/ErrorHandler');
const UserFacingError = require('../utils/UserFacingError');

const logger = new Logger();
const errorHandler = new ErrorHandler();

const OSU_API_BASE = 'https://osu.ppy.sh/api';
const API_TIMEOUT = 10000;
const MAX_RETRIES = 3;

async function getUser(username, id = null, mode = 0) {
    if (!process.env.OSU_API_KEY) {
        const error = new UserFacingError('API configuration error', 'EN', 'API_CONFIG_ERROR');
        errorHandler.handleError(error, 'OSU_API_GET_USER', { username, id });
        throw error;
    }

    if (!username || typeof username !== 'string') {
        throw new UserFacingError('Invalid username provided', 'EN', 'INVALID_USERNAME');
    }

    const wrappedCall = errorHandler.wrapApiCall(async () => {
        const startTime = Date.now();
        
        const params = new URLSearchParams({
            k: process.env.OSU_API_KEY,
            u: username,
            m: mode.toString()
        });

        const response = await axios.get(`${OSU_API_BASE}/get_user`, {
            params,
            timeout: API_TIMEOUT,
            headers: {
                'User-Agent': 'Pupsbot/1.0'
            }
        });

        const duration = Date.now() - startTime;
        logger.info('OSU_API', `GET /get_user - ${response.status} (${duration}ms)`, { username, mode });

        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            throw new UserFacingError('User not found', 'EN', 'USER_NOT_FOUND');
        }

        const userData = response.data[0];
        return {
            locale: userData.country || 'EN',
            id: parseInt(userData.user_id, 10),
            username: userData.username,
            pp: parseFloat(userData.pp_raw) || 0,
            playcount: parseInt(userData.playcount, 10) || 0,
            level: parseFloat(userData.level) || 0
        };
    }, 'OSU_API_GET_USER', MAX_RETRIES);

    return await wrappedCall();
}

async function getTop100MultiModes(userId, id = null) {
    if (!process.env.OSU_API_KEY) {
        const error = new UserFacingError('API configuration error', 'EN', 'API_CONFIG_ERROR');
        errorHandler.handleError(error, 'OSU_API_GET_TOP', { userId, id });
        throw error;
    }

    if (!userId || (typeof userId !== 'string' && typeof userId !== 'number')) {
        throw new UserFacingError('Invalid user ID provided', 'EN', 'INVALID_USER_ID');
    }

    const modes = [
        { id: '0', name: 'osu' },
        { id: '1', name: 'taiko' },
        { id: '2', name: 'catch' },
        { id: '3', name: 'mania' }
    ];

    const wrappedCall = errorHandler.wrapApiCall(async () => {
        const results = {};
        const startTime = Date.now();

        for (const mode of modes) {
            try {
                const params = new URLSearchParams({
                    k: process.env.OSU_API_KEY,
                    u: userId.toString(),
                    m: mode.id,
                    limit: '100'
                });

                const response = await axios.get(`${OSU_API_BASE}/get_user_best`, {
                    params,
                    timeout: API_TIMEOUT,
                    headers: {
                        'User-Agent': 'Pupsbot/1.0'
                    }
                });

                const rawScores = response.data || [];
                const scores = rawScores.map(entry => ({
                    beatmap_id: parseInt(entry.beatmap_id, 10),
                    date: new Date(entry.date + 'Z'),
                    raw_pp: parseFloat(entry.pp) || 0,
                    accuracy: parseFloat(entry.accuracy) || 0,
                    max_combo: parseInt(entry.maxcombo, 10) || 0
                }));

                const validScores = scores.filter(score => !isNaN(score.raw_pp) && score.raw_pp > 0);
                results[mode.name] = calculatePPGains(validScores);
                
            } catch (modeError) {
                logger.warn('OSU_API_GET_TOP', `Failed to fetch ${mode.name} scores for user ${userId}`, { error: modeError.message });
                results[mode.name] = { table: new Set(), tr: [], possibles: [] };
            }
        }

        const duration = Date.now() - startTime;
        logger.info('OSU_API_PERFORMANCE', `GET_TOP_ALL_MODES completed in ${duration}ms`, { userId, modesCount: modes.length });
        
        return results;
    }, 'OSU_API_GET_TOP', MAX_RETRIES);

    return await wrappedCall();
}

function calculatePPGains(scores) {
    if (!scores || scores.length === 0) {
        return { table: new Set(), tr: [], possibles: [] };
    }

    const existingMapIds = new Set(scores.map(score => score.beatmap_id));
    const baseWeightedPP = scores.reduce(
        (total, score, index) => total + (score.raw_pp * Math.pow(0.95, index)),
        0
    );

    const gainCandidates = [];
    const minPP = scores[99]?.raw_pp || 0;

    for (let pp = Math.max(minPP + 1, 5); pp <= 2000; pp += pp < 500 ? 1 : (pp < 1000 ? 5 : 10)) {
        const hypothetical = [...scores, { raw_pp: pp }];
        const top100 = hypothetical
            .sort((a, b) => b.raw_pp - a.raw_pp)
            .slice(0, 100);

        const newTotalPP = top100.reduce(
            (sum, score, index) => sum + (score.raw_pp * Math.pow(0.95, index)),
            0
        );

        const gain = newTotalPP - baseWeightedPP;
        const rank = top100.findIndex(score => score.raw_pp === pp);

        if (rank !== -1 && gain >= 1) {
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
        tr: scores,
        possibles: gainCandidates.slice(0, 20)
    };
}

async function getBeatmap(beatmapId, mode = null) {
    if (!process.env.OSU_API_KEY) {
        const error = new UserFacingError('API configuration error', 'EN', 'API_CONFIG_ERROR');
        errorHandler.handleError(error, 'OSU_API_GET_BEATMAP', { beatmapId });
        throw error;
    }

    if (!beatmapId || (typeof beatmapId !== 'string' && typeof beatmapId !== 'number')) {
        throw new UserFacingError('Invalid beatmap ID provided', 'EN', 'INVALID_BEATMAP_ID');
    }

    const wrappedCall = errorHandler.wrapApiCall(async () => {
        const startTime = Date.now();
        
        const params = new URLSearchParams({
            k: process.env.OSU_API_KEY,
            b: beatmapId.toString()
        });

        if (mode !== null && mode >= 0 && mode <= 3) {
            params.append('m', mode.toString());
        }

        const response = await axios.get(`${OSU_API_BASE}/get_beatmaps`, {
            params,
            timeout: API_TIMEOUT,
            headers: {
                'User-Agent': 'Pupsbot/1.0'
            }
        });

        const duration = Date.now() - startTime;
        logger.info('OSU_API', `GET /get_beatmaps - ${response.status} (${duration}ms)`, { beatmapId, mode });

        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            throw new UserFacingError('Beatmap not found', 'EN', 'BEATMAP_NOT_FOUND');
        }

        const beatmap = response.data[0];
        return {
            ...beatmap,
            beatmap_id: parseInt(beatmap.beatmap_id, 10),
            beatmapset_id: parseInt(beatmap.beatmapset_id, 10),
            mode: parseInt(beatmap.mode, 10),
            approved: parseInt(beatmap.approved, 10),
            total_length: parseInt(beatmap.total_length, 10),
            hit_length: parseInt(beatmap.hit_length, 10),
            count_normal: parseInt(beatmap.count_normal, 10),
            count_slider: parseInt(beatmap.count_slider, 10),
            count_spinner: parseInt(beatmap.count_spinner, 10),
            diff_approach: parseFloat(beatmap.difficultyrating) || 0,
            diff_overall: parseFloat(beatmap.diff_overall) || 0,
            diff_hp: parseFloat(beatmap.diff_drain) || 0,
            diff_cs: parseFloat(beatmap.diff_size) || 0,
            diff_aim: parseFloat(beatmap.diff_aim) || 0,
            diff_speed: parseFloat(beatmap.diff_speed) || 0
        };
    }, 'OSU_API_GET_BEATMAP', MAX_RETRIES);

    return await wrappedCall();
}

async function hasUserPlayedMap(userId, beatmapId, mode = 0) {
    if (!process.env.OSU_API_KEY) {
        logger.error('OSU_API_HAS_PLAYED', 'Missing OSU_API_KEY in environment variables');
        return null;
    }

    if (!userId || !beatmapId) {
        logger.warn('OSU_API_HAS_PLAYED', 'Invalid userId or beatmapId provided', { userId, beatmapId });
        return null;
    }

    try {
        const params = new URLSearchParams({
            k: process.env.OSU_API_KEY,
            u: userId.toString(),
            b: beatmapId.toString(),
            limit: '1',
            m: mode.toString()
        });

        const response = await axios.get(`${OSU_API_BASE}/get_scores`, {
            params,
            timeout: API_TIMEOUT,
            headers: {
                'User-Agent': 'Pupsbot/1.0'
            }
        });

        const scores = response.data;
        if (!Array.isArray(scores) || scores.length === 0) {
            return false;
        }

        const topScore = scores[0];
        return {
            played: true,
            date: topScore.date,
            pp: parseFloat(topScore.pp) || 0,
            score: parseInt(topScore.score, 10) || 0,
            accuracy: parseFloat(topScore.accuracy) || 0,
            max_combo: parseInt(topScore.maxcombo, 10) || 0
        };
    } catch (error) {
        logger.warn('OSU_API_HAS_PLAYED', `Error checking if user played beatmap`, {
            userId,
            beatmapId,
            mode,
            error: error.message
        });
        return null;
    }
}

module.exports = { 
    getUser, 
    getTop100MultiModes, 
    getBeatmap, 
    hasUserPlayedMap,
    
    getTop100MultiMods: getTop100MultiModes
};
