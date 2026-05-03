const axios = require('axios');
const OsuAuth = require('./OsuAuth');
const RedisStore = require('./RedisStore');
const Notifier = require('./Notifier');
const Logger = require('../utils/Logger');
const MetricsCollector = require('./MetricsCollector');

class OsuApiV2 {
    constructor() {
        this.auth = new OsuAuth();
        this.baseUrl = 'https://osu.ppy.sh/api/v2';
        this.notifier = new Notifier();

        this.initializeAuth();
    }

    async initializeAuth() {
        try {
            await this.auth.getClientCredentialsToken();
            Logger.service('OsuApiV2: Authentication initialized successfully');
        } catch (error) {
            Logger.errorCatch('OsuApiV2', 'Failed to initialize authentication');
        }
    }
    async makeAuthenticatedRequest(endpoint, options = {}, operationName = 'API_REQUEST') {
        const performe = new RedisStore();
        const metricsCollector = new MetricsCollector();
        let duration = null;

        try {
            await performe.init();
            await metricsCollector.init();

            // Log detailed API call information
            Logger.service(`OsuApiV2: ${operationName} → ${endpoint}`);

            const t = performe.startTimer();
            const accessToken = await this.auth.getValidAccessToken();

            const config = {
                ...options,
                url: `${this.baseUrl}${endpoint}`,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...options.headers
                }
            };

            const response = await axios(config);
            duration = await t.stop(operationName);

            await metricsCollector.recordServicePerformance('api', operationName, duration, 'v2');

            return response.data;
        } catch (error) {
            if (duration === null) {
                duration = 0;
            }
            if (error.response?.status === 401) {
                try {
                    Logger.service('OsuApiV2: Token expired, getting new token');
                    const newAccessToken = await this.auth.getValidAccessToken();

                    const retryConfig = {
                        ...options,
                        url: `${this.baseUrl}${endpoint}`,
                        headers: {
                            'Authorization': `Bearer ${newAccessToken}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            ...options.headers
                        }
                    };

                    const retryResponse = await axios(retryConfig);
                    return retryResponse.data;
                } catch (retryError) {
                    const msg = `API V2 request failed after token renewal: ${retryError.message}`;
                    Logger.errorCatch('OsuApiV2', msg);
                    await this.notifier.send(msg, `OSUAPIV2.${operationName}`);
                    throw new Error(msg);
                }
            }

            const msg = `API V2 request failed: ${error.response?.data?.error || error.message}`;
            Logger.errorCatch('OsuApiV2', msg);
            await this.notifier.send(msg, `OSUAPIV2.${operationName}`);
            throw new Error(msg);
        } finally {
            if (performe) {
                await performe.close();
            }
            await metricsCollector.close();
        }
    }
    async getUser(user, mode = 'osu') {
        const startTime = Date.now();
        const performe = new RedisStore();
        const metricsCollector = new MetricsCollector();

        try {
            await performe.init();
            await metricsCollector.init();

            // Check Redis cache first (try both username and id as keys)
            let cachedProfile = await performe.getCachedProfile(user);
            if (cachedProfile) {
                const duration = Date.now() - startTime;
                await metricsCollector.recordServicePerformance('api', 'getUser', duration, 'v2_cache');
                console.log(`OsuApiV2: Profile cache hit for user ${user}: ${cachedProfile.username}`);
                return cachedProfile;
            }

            // Cache miss - fetch from API
            console.log(`OsuApiV2: Profile cache miss for user ${user}, fetching from API`);

            const endpoint = `/users/${encodeURIComponent(user)}/${mode}`;
            const userData = await this.makeAuthenticatedRequest(endpoint, { method: 'GET' }, 'GETUSER_V2');

            const profileData = {
                id: userData.id,
                username: userData.username,
                pp: userData.statistics?.pp || 0,
                locale: userData.country_code || 'XX'
            };

            // Cache the profile data with both username and id as keys
            await performe.setCachedProfile(profileData.id, profileData);
            await performe.setCachedProfile(profileData.username, profileData);

            return userData; // Return original data for compatibility
        } catch (error) {
            console.error(`OsuApiV2 getUser failed for ${user}:`, error.message);
            throw error;
        } finally {
            await performe.close();
            await metricsCollector.close();
        }
    }
    async getUserBestScores(userId, options = {}) {
        const {
            mode = 'osu',
            limit = 100,
            offset = 0
        } = options;

        const params = new URLSearchParams({
            mode,
            limit: limit.toString(),
            offset: offset.toString()
        });

        const endpoint = `/users/${userId}/scores/best?${params.toString()}`;
        return await this.makeAuthenticatedRequest(endpoint, { method: 'GET' }, 'GETUSERBEST_V2');
    }
    async getUserRecentScores(userId, options = {}) {
        const {
            mode = 'osu',
            limit = 50,
            offset = 0,
            includeFails = true
        } = options;

        const params = new URLSearchParams({
            mode,
            limit: limit.toString(),
            offset: offset.toString(),
            include_fails: includeFails ? '1' : '0'
        });

        const endpoint = `/users/${userId}/scores/recent?${params.toString()}`;
        return await this.makeAuthenticatedRequest(endpoint, { method: 'GET' }, 'GETUSERRECENT_V2');
    }
    async getBeatmap(beatmapId) {
        const endpoint = `/beatmaps/${beatmapId}`;
        return await this.makeAuthenticatedRequest(endpoint, { method: 'GET' }, 'GETBEATMAP_V2');
    }
    async getBeatmapset(beatmapsetId) {
        const endpoint = `/beatmapsets/${beatmapsetId}`;
        return await this.makeAuthenticatedRequest(endpoint, { method: 'GET' }, 'GETBEATMAPSET_V2');
    }
    async getBeatmapScores(beatmapId, options = {}) {
        const {
            mode = 'osu',
            mods = [],
            type = 'global'
        } = options;

        const params = new URLSearchParams({
            mode,
            type
        });

        if (mods.length > 0) {
            params.append('mods', mods.join(''));
        }

        const endpoint = `/beatmaps/${beatmapId}/scores?${params.toString()}`;
        return await this.makeAuthenticatedRequest(endpoint, { method: 'GET' }, 'GETBEATMAPSCORES_V2');
    }
    async getUserBeatmapScore(beatmapId, userId, options = {}) {
        const {
            mode = 'osu',
            mods = []
        } = options;

        const params = new URLSearchParams({
            mode
        });

        if (mods.length > 0) {
            params.append('mods', mods.join(''));
        }

        const endpoint = `/beatmaps/${beatmapId}/scores/users/${userId}?${params.toString()}`;
        return await this.makeAuthenticatedRequest(endpoint, { method: 'GET' }, 'GETUSERBEATMAPSCORE_V2');
    }
    async searchBeatmaps(options = {}) {
        const {
            query = '',
            mode = 'osu',
            status = 'ranked',
            genre = 'any',
            language = 'any',
            sort = 'ranked_desc',
            cursor = null
        } = options;

        const params = new URLSearchParams({
            q: query,
            m: mode,
            s: status,
            g: genre,
            l: language,
            sort
        });

        if (cursor) {
            params.append('cursor_string', cursor);
        }

        const endpoint = `/beatmapsets/search?${params.toString()}`;
        return await this.makeAuthenticatedRequest(endpoint, { method: 'GET' }, 'SEARCHBEATMAPS_V2');
    }
    async getUserRanking(userId, mode = 'osu') {
        const endpoint = `/rankings/${mode}/performance`;
        const params = new URLSearchParams({
            filter: 'all',
            cursor: JSON.stringify({ page: 1 })
        });

        const userData = await this.getUser(userId, mode);
        return {
            global_rank: userData.statistics?.global_rank || null,
            country_rank: userData.statistics?.country_rank || null,
            pp: userData.statistics?.pp || null
        };
    }
    async healthCheck() {
        try {
            await this.makeAuthenticatedRequest('/users/2', { method: 'GET' }, 'HEALTHCHECK_V2');
            return true;
        } catch (error) {
            Logger.errorCatch('OsuApiV2', `Health check failed: ${error.message}`);
            return false;
        }
    }
    async getMe() {
        return await this.makeAuthenticatedRequest('/me', { method: 'GET' }, 'GETME_V2');
    }
    getAuthInfo() {
        return this.auth.getTokenInfo();
    }
    async refreshToken() {
        await this.auth.getClientCredentialsToken();
        Logger.service('OsuApiV2: Token manually renewed');
    }
    async getTopScoresAllModes(userId, id) {
        const modes = ['osu', 'taiko', 'fruits', 'mania'];
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


                let allScores = [];
                let offset = 0;
                const limit = 100;
                let hasMoreScores = true;

                while (hasMoreScores && offset < 1000) {
                    try {
                        const scores = await this.getUserBestScores(userId, {
                            mode,
                            limit,
                            offset
                        });

                        if (!scores || scores.length === 0) {
                            hasMoreScores = false;
                            break;
                        }

                        allScores = allScores.concat(scores);
                        offset += limit;


                        if (scores.length < limit) {
                            hasMoreScores = false;
                        }
                    } catch (error) {
                        Logger.errorCatch('OsuApiV2', `Error fetching scores for ${mode} at offset ${offset}: ${error.message}`);
                        hasMoreScores = false;
                    }
                }


                const rawScores = allScores.map(score => ({
                    beatmap_id: score.beatmap.id.toString(),
                    date: score.created_at,
                    pp: score.pp?.toString() || '0',
                    score_id: score.id?.toString(),
                    accuracy: ((score.accuracy || 0) * 100).toString(),
                    max_combo: score.max_combo?.toString() || '0',
                    perfect: score.perfect ? '1' : '0',
                    enabled_mods: score.mods?.map(mod => mod.acronym).join('') || '',
                    user_id: score.user_id?.toString() || userId.toString(),
                    rank: score.rank || 'F'
                }));

                const scores = rawScores.map(entry => ({
                    beatmap_id: parseInt(entry.beatmap_id, 10),
                    date: new Date(entry.date),
                    raw_pp: parseFloat(entry.pp) || 0
                })).filter(score => score.raw_pp > 0);

                const existingMapIds = new Set(scores.map(score => score.beatmap_id));
                const baseWeightedPP = scores.reduce(
                    (total, score, index) => total + score.raw_pp * Math.pow(0.95, index),
                    0
                );

                const gainCandidates = [];
                const maxCurrentPP = scores[0]?.raw_pp || 0;
                const minPPToConsider = Math.max(5, scores[scores.length - 1]?.raw_pp || 0);

                for (let pp = minPPToConsider; pp <= Math.max(2000, maxCurrentPP * 1.5); pp += pp < 500 ? 1 : (pp < 1000 ? 5 : 10)) {
                    if (scores.length >= 100 && pp <= scores[99]?.raw_pp) continue;

                    const hypothetical = [...scores, { raw_pp: pp }];
                    const topScores = hypothetical
                        .sort((a, b) => b.raw_pp - a.raw_pp)
                        .slice(0, Math.max(100, scores.length + 1));

                    const newTotalPP = topScores.reduce(
                        (sum, score, index) => sum + score.raw_pp * Math.pow(0.95, index),
                        0
                    );

                    const gain = newTotalPP - baseWeightedPP;
                    const rank = topScores.findIndex(score => score.raw_pp === pp);

                    if (rank === -1) continue;
                    if (gain >= 1) {
                        gainCandidates.push({
                            brut: pp,
                            position: rank + 1,
                            gain: parseFloat(gain.toFixed(2)),
                            newTotal: parseFloat(newTotalPP.toFixed(2))
                        });
                    }
                }

                gainCandidates.sort((a, b) => b.gain - a.gain);

                results[modeName] = {
                    table: existingMapIds,
                    tr: rawScores,
                    possibles: gainCandidates.slice(0, 50),
                    totalScores: allScores.length,
                    currentWeightedPP: parseFloat(baseWeightedPP.toFixed(2))
                };
            }

            duration = await t.stop('GETTOP_ALL_MODES_V2');
            await metricsCollector.recordServicePerformance('api', 'getTopScoresAllModes', duration, 'v2');

            return results;
        } catch (err) {
            await this.notifier.send(`Erreur getTopScoresAllModes(${userId}) [${id}] : ${err.message}`, 'OSUAPIV2.GETTOP');
            throw err;
        } finally {
            await performe.close();
            await metricsCollector.close();
        }
    }
    async getTop100MultiMods(userId, id) {
        return await this.getTopScoresAllModes(userId, id);
    }
    async getBeatmapAttributes(beatmapId, mods = 0, ruleset = 'osu') {
        const params = new URLSearchParams();

        if (mods && mods !== 0) {
            params.append('mods', mods.toString());
        }

        params.append('ruleset', ruleset);

        const endpoint = `/beatmaps/${beatmapId}/attributes?${params.toString()}`;

        const config = {
            method: 'POST'
        };

        return await this.makeAuthenticatedRequest(endpoint, config, 'GETBEATMAPATTRIBUTES_V2');
    }
    async getBeatmapStarRating(beatmapId, mods = 0, ruleset = 'osu') {
        try {
            const attributes = await this.getBeatmapAttributes(beatmapId, mods, ruleset);

            return {
                star_rating: attributes.attributes.star_rating,
                max_combo: attributes.attributes.max_combo,
                aim_difficulty: attributes.attributes.aim_difficulty || null,
                speed_difficulty: attributes.attributes.speed_difficulty || null,
                flashlight_difficulty: attributes.attributes.flashlight_difficulty || null,
                slider_factor: attributes.attributes.slider_factor || null,
                speed_note_count: attributes.attributes.speed_note_count || null,
                approach_rate: attributes.attributes.approach_rate || null,
                overall_difficulty: attributes.attributes.overall_difficulty || null,
                circle_size: attributes.attributes.circle_size || null,
                health_drain: attributes.attributes.health_drain || null,
                mods: mods,
                ruleset: ruleset,
                beatmap_id: beatmapId
            };
        } catch (error) {
            const msg = `Failed to get star rating for beatmap ${beatmapId} with mods ${mods}: ${error.message}`;
            Logger.errorCatch('OsuApiV2', msg);
            throw new Error(msg);
        }
    }

}

module.exports = OsuApiV2;
