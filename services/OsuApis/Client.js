const axios = require('axios');
const Logger = require('../../utils/Logger');

class OsuApiClient {
    constructor(baseUrl = 'http://localhost:25586') {
        this.baseUrl = baseUrl;
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async healthCheck() {
        try {
            const response = await this.client.get('/health');
            return response.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `Health check failed: ${error.message}`);
            throw error;
        }
    }

    async getUser(user, mode = 'osu') {
        try {
            const response = await this.client.get(`/user/${encodeURIComponent(user)}`, {
                params: { mode }
            });

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                Logger.errorCatch('OsuApiClient', `Connection refused to internal server for getUser(${user}). Is the server running on port 3001?`);
            } else if (error.response) {
                Logger.errorCatch('OsuApiClient', `HTTP ${error.response.status} for getUser(${user}): ${error.response.data?.error || error.message}`);
            } else {
                Logger.errorCatch('OsuApiClient', `getUser failed for ${user}: ${error.message}`);
            }
            throw error;
        }
    }

    async getFullUser(userId) {
        try {
            const response = await this.client.get(`/user/${userId}/full`);

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                Logger.errorCatch('OsuApiClient', `Connection refused to internal server for getFullUser(${userId}). Is the server running on port 25586?`);
            } else if (error.response) {
                Logger.errorCatch('OsuApiClient', `HTTP ${error.response.status} for getFullUser(${userId}): ${error.response.data?.error || error.message}`);
            } else {
                Logger.errorCatch('OsuApiClient', `getFullUser failed for ${userId}: ${error.message}`);
            }
            throw error;
        }
    }

    async getUserBestScores(userId, options = {}) {
        try {
            const params = {
                mode: options.mode || 'osu',
                limit: options.limit || 100,
                offset: options.offset || 0
            };

            const response = await this.client.get(`/user/${userId}/scores/best`, {
                params
            });

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                Logger.errorCatch('OsuApiClient', `Connection refused to internal server for getUserBestScores(${userId}). Is the server running on port 3001?`);
            } else if (error.response) {
                Logger.errorCatch('OsuApiClient', `HTTP ${error.response.status} for getUserBestScores(${userId}): ${error.response.data?.error || error.message}`);
            } else {
                Logger.errorCatch('OsuApiClient', `getUserBestScores failed for ${userId}: ${error.message}`);
            }
            throw error;
        }
    }

    async getTopScoresAllModes(userId) {
        try {
            const response = await this.client.get(`/user/${userId}/scores/top-all-modes`);

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                Logger.errorCatch('OsuApiClient', `Connection refused to internal server for getTopScoresAllModes(${userId}). Is the server running on port 3001?`);
            } else if (error.response) {
                Logger.errorCatch('OsuApiClient', `HTTP ${error.response.status} for getTopScoresAllModes(${userId}): ${error.response.data?.error || error.message}`);
            } else {
                Logger.errorCatch('OsuApiClient', `getTopScoresAllModes failed for ${userId}: ${error.message}`);
            }
            throw error;
        }
    }

    async getUserRecentScores(userId, options = {}) {
        try {
            const params = {
                mode: options.mode || 'osu',
                limit: options.limit || 50,
                offset: options.offset || 0,
                include_fails: options.includeFails || false
            };

            const response = await this.client.get(`/user/${userId}/scores/recent`, {
                params
            });

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `getUserRecentScores failed for ${userId}: ${error.message}`);
            throw error;
        }
    }

    async getBeatmap(beatmapId) {
        try {
            const response = await this.client.get(`/beatmap/${beatmapId}`);

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `getBeatmap failed for ${beatmapId}: ${error.message}`);
            throw error;
        }
    }

    async getBeatmapset(beatmapsetId) {
        try {
            const response = await this.client.get(`/beatmapset/${beatmapsetId}`);

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `getBeatmapset failed for ${beatmapsetId}: ${error.message}`);
            throw error;
        }
    }

    async getBeatmapScores(beatmapId, options = {}) {
        try {
            const params = {
                mode: options.mode || 'osu',
                mods: options.mods ? options.mods.join(',') : '',
                type: options.type || 'global'
            };

            const response = await this.client.get(`/beatmap/${beatmapId}/scores`, {
                params
            });

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `getBeatmapScores failed for ${beatmapId}: ${error.message}`);
            throw error;
        }
    }

    async getUserBeatmapScore(beatmapId, userId, options = {}) {
        try {
            const params = {
                mode: options.mode || 'osu',
                mods: options.mods ? options.mods.join(',') : ''
            };

            const response = await this.client.get(`/beatmap/${beatmapId}/scores/user/${userId}`, {
                params
            });

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `getUserBeatmapScore failed for beatmap ${beatmapId}, user ${userId}: ${error.message}`);
            throw error;
        }
    }

    async searchBeatmaps(options = {}) {
        try {
            const params = {
                q: options.query || '',
                m: options.mode || 'osu',
                s: options.status || 'ranked',
                g: options.genre || 'any',
                l: options.language || 'any',
                sort: options.sort || 'ranked_desc',
                cursor: options.cursor || null
            };

            const response = await this.client.get('/search/beatmaps', {
                params
            });

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `searchBeatmaps failed: ${error.message}`);
            throw error;
        }
    }

    async getTopScoresAllModes(userId, id = 'client') {
        try {
            const response = await this.client.post(`/user/${userId}/top-scores/all-modes`, {
                id
            });

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `getTopScoresAllModes failed for ${userId}: ${error.message}`);
            throw error;
        }
    }

    async getBeatmapStarRating(beatmapId, mods = 0, ruleset = 'osu') {
        try {
            const params = {
                mods,
                ruleset
            };

            const response = await this.client.get(`/beatmap/${beatmapId}/stars`, {
                params
            });

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `getBeatmapStarRating failed for ${beatmapId}: ${error.message}`);
            throw error;
        }
    }

    async refreshToken() {
        try {
            const response = await this.client.post('/refresh-token');

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `refreshToken failed: ${error.message}`);
            throw error;
        }
    }

    async getRateLimiterStats() {
        try {
            const response = await this.client.get('/rate-limiter/stats');

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            return response.data.data;
        } catch (error) {
            Logger.errorCatch('OsuApiClient', `getRateLimiterStats failed: ${error.message}`);
            throw error;
        }
    }
}

module.exports = OsuApiClient;
