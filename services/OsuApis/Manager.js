const V2 = require('./V2');
const RedisStore = require('../RedisStore');
const MetricsCollector = require('../MetricsCollector');
const RateLimiter = require('./RateLimiter');
const Logger = require('../../utils/Logger');

class OsuApiManager {
    constructor() {
        this.v2 = new V2();
        this.redis = null;
        this.metrics = null;
        this.rateLimiter = new RateLimiter(60, 10); // 60 req/min, 10 burst
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        try {
            this.redis = new RedisStore();
            this.metrics = new MetricsCollector();

            await this.redis.init();
            await this.metrics.init();

            await this.v2.initializeAuth();

            this.isInitialized = true;
            Logger.service('OsuApiManager: All APIs and services initialized');
        } catch (error) {
            Logger.errorCatch('OsuApiManager', `Failed to initialize: ${error.message}`);
            throw error;
        }
    }

    async close() {
        if (this.redis) {
            await this.redis.close();
            this.redis = null;
        }

        if (this.metrics) {
            await this.metrics.close();
            this.metrics = null;
        }

        this.isInitialized = false;
    }

    async getUser(user, mode = 'osu') {
        await this.init();

        const startTime = Date.now();

        try {
            let cachedProfile = await this.redis.getCachedProfile(user);

            if (cachedProfile) {
                const duration = Date.now() - startTime;
                await this.metrics.recordServicePerformance('api', 'getUser', duration, 'redis');

                this.refreshUserInBackground(user, mode).catch(error => {
                    Logger.errorCatch('OsuApiManager', `Background refresh failed for ${user}: ${error.message}`);
                });

                return cachedProfile;
            }

            Logger.service(`[API-CALL] getUser(${user}) → No cache, fetching from OsuAPI V2`);

            const userData = await this.rateLimiter.executeRequest(async () => {
                return await this.v2.getUser(user, mode);
            });

            const standardizedData = this.standardizeUserData(userData, mode);
            await this.redis.setCachedProfile(user, standardizedData);
            if (standardizedData.topRanks) {
                await this.redis.setTopRanks(userData.id, standardizedData.topRanks);
            }

            const duration = Date.now() - startTime;
            await this.metrics.recordServicePerformance('api', 'getUser', duration, 'v2');

            Logger.service(`[CACHE-SAVE] getUser(${user}) → Cached: PP:${standardizedData.pp} Locale:${standardizedData.locale} TopRanks:${standardizedData.topRanks || 'N/A'}`);
            return standardizedData;
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.metrics.recordServicePerformance('api', 'getUser', duration, 'error');

            Logger.errorCatch('OsuApiManager', `getUser failed for ${user}: ${error.message}`);
            throw error;
        }
    }

    async refreshUserInBackground(user, mode = 'osu') {
        try {
            Logger.service(`[BACKGROUND] Starting refresh for getUser(${user})`);

            const userData = await this.rateLimiter.executeRequest(async () => {
                return await this.v2.getUser(user, mode);
            });

            const standardizedData = this.standardizeUserData(userData, mode);
            await this.redis.setCachedProfile(user, standardizedData);

            if (standardizedData.topRanks) {
                await this.redis.setTopRanks(userData.id, standardizedData.topRanks);
            }

            Logger.service(`[BACKGROUND-UPDATE] getUser(${user}) → Updated cache: PP:${standardizedData.pp} Locale:${standardizedData.locale} TopRanks:${standardizedData.topRanks || 'N/A'}`);
        } catch (error) {
            Logger.errorCatch('OsuApiManager', `Background refresh failed for ${user}: ${error.message}`);
        }
    }

    standardizeUserData(userData, mode = 'osu') {
        return {
            id: userData.id,
            username: userData.username,
            pp: userData.statistics?.pp || 0,
            locale: userData.country?.code || 'XX',
            topRanks: userData.statistics?.global_rank || null,
            country_rank: userData.statistics?.country_rank || null,
            level: userData.statistics?.level?.current || null,
            playcount: userData.statistics?.play_count || 0,
            accuracy: userData.statistics?.hit_accuracy || 0,
            mode: mode,
            cached_at: new Date().toISOString()
        };
    }

    async getUserBestScores(userId, options = {}) {
        await this.init();

        const startTime = Date.now();

        try {
            const cacheKey = `user_best_scores:${userId}:${JSON.stringify(options)}`;
            let cachedScores = await this.redis.get(cacheKey);
            if (cachedScores) {
                const duration = Date.now() - startTime;
                await this.metrics.recordServicePerformance('api', 'getUserBestScores', duration, 'redis');

                const scores = JSON.parse(cachedScores);
                Logger.service(`[CACHE-HIT] getUserBestScores(${userId}) → ${Array.isArray(scores) ? scores.length : 'invalid'} scores served instantly`);
                this.refreshUserBestScoresInBackground(userId, options, cacheKey).catch(error => {
                    Logger.errorCatch('OsuApiManager', `Background refresh failed for best scores ${userId}: ${error.message}`);
                });

                return scores;
            }

            Logger.service(`[API-CALL] getUserBestScores(${userId}) → No cache, fetching from OsuAPI V2`);

            const scores = await this.rateLimiter.executeRequest(async () => {
                return await this.v2.getUserBestScores(userId, options);
            });

            const standardizedScores = this.standardizeScoresData(scores);

            await this.redis.setex(cacheKey, 300, JSON.stringify(standardizedScores));

            const duration = Date.now() - startTime;
            await this.metrics.recordServicePerformance('api', 'getUserBestScores', duration, 'v2');

            Logger.service(`[CACHE-SAVE] getUserBestScores(${userId}) → Cached ${standardizedScores.length} scores`);
            return standardizedScores;
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.metrics.recordServicePerformance('api', 'getUserBestScores', duration, 'error');

            Logger.errorCatch('OsuApiManager', `getUserBestScores failed for ${userId}: ${error.message}`);
            throw error;
        }
    }

    async refreshUserBestScoresInBackground(userId, options, cacheKey) {
        try {
            const scores = await this.rateLimiter.executeRequest(async () => {
                return await this.v2.getUserBestScores(userId, options);
            });

            const standardizedScores = this.standardizeScoresData(scores);
            await this.redis.setex(cacheKey, 300, JSON.stringify(standardizedScores));

            Logger.service(`[BACKGROUND-UPDATE] getUserBestScores(${userId}) → Updated cache with ${standardizedScores.length} scores`);
        } catch (error) {
            Logger.errorCatch('OsuApiManager', `Background refresh failed for best scores ${userId}: ${error.message}`);
        }
    }

    standardizeScoresData(scores) {
        if (!Array.isArray(scores)) return [];

        return scores.map(score => {
            // Debug: log the raw score structure to understand mods format
            Logger.service(`[DEBUG] Raw score structure: ${JSON.stringify(score, null, 2)}`);

            return {
                id: score.id,
                pp: score.pp || 0,
                beatmap_id: score.beatmap?.id || score.beatmap_id,
                beatmapset_id: score.beatmap?.beatmapset_id || score.beatmapset_id,
                accuracy: score.accuracy || 0,
                max_combo: score.max_combo || 0,
                score: score.score || 0,
                rank: score.rank || 'F',
                created_at: score.created_at,
                mode: score.mode || 'osu',
                mods: score.mods || [],
                enabled_mods: score.mods || [], // Map mods to enabled_mods for compatibility
                beatmap: score.beatmap,
                user: score.user,
                statistics: score.statistics
            };
        });
    }

    async getBeatmap(beatmapId) {
        await this.init();

        const startTime = Date.now();
        let source = 'unknown';

        try {
            const cacheKey = `beatmap:${beatmapId}`;
            let cachedBeatmap = await this.redis.get(cacheKey);
            if (cachedBeatmap) {
                const duration = Date.now() - startTime;
                await this.metrics.recordServicePerformance('api', 'getBeatmap', duration, 'redis');
                Logger.service(`OsuApiManager: Beatmap cache hit for ${beatmapId}`);
                return JSON.parse(cachedBeatmap);
            }

            Logger.service(`OsuApiManager: Cache miss for beatmap ${beatmapId}, fetching from V2 API`);
            const beatmap = await this.rateLimiter.executeRequest(async () => {
                return await this.v2.getBeatmap(beatmapId);
            });
            source = 'v2';
            await this.redis.setex(cacheKey, 3600, JSON.stringify(beatmap));

            const duration = Date.now() - startTime;
            await this.metrics.recordServicePerformance('api', 'getBeatmap', duration, 'v2');

            return beatmap;
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.metrics.recordServicePerformance('api', 'getBeatmap', duration, 'error');

            Logger.errorCatch('OsuApiManager', `getBeatmap failed for ${beatmapId} (source: ${source}): ${error.message}`);
            throw error;
        }
    }


    async refreshToken() {
        await this.init();

        try {
            await this.v2.refreshToken();
            Logger.service('OsuApiManager: V2 token refreshed');
        } catch (error) {
            Logger.errorCatch('OsuApiManager', `Token refresh failed: ${error.message}`);
            throw error;
        }
    }

    async getTopRanks(userId) {
        await this.init();

        try {
            let topRanks = await this.redis.getTopRanks(userId);

            if (topRanks) {
                Logger.service(`OsuApiManager: Top ranks cache hit for user ${userId}`);
                return topRanks;
            }
            const userData = await this.getUser(userId);
            topRanks = await this.redis.getTopRanks(userId);

            return topRanks;
        } catch (error) {
            Logger.errorCatch('OsuApiManager', `getTopRanks failed for ${userId}: ${error.message}`);
            throw error;
        }
    }

    async healthCheck() {
        await this.init();

        try {
            const v2Health = await this.v2.healthCheck();

            return {
                v2: v2Health,
                redis: this.redis ? true : false,
                metrics: this.metrics ? true : false
            };
        } catch (error) {
            Logger.errorCatch('OsuApiManager', `Health check failed: ${error.message}`);
            return {
                v2: false,
                redis: false,
                metrics: false,
                error: error.message
            };
        }
    }
}

module.exports = OsuApiManager;
