const OsuApiV1 = require('./OsuApiV1');
const OsuApiV2 = require('./OsuApiV2');
const Logger = require('../utils/Logger');
const MetricsCollector = require('./MetricsCollector');

class OsuApiWrapper {
    constructor() {
        this.preferV2 = true;
        this.v2Available = false;
        this.osuApiV2 = null;
        this.checkV2Availability();
    }

    async checkV2Availability() {
        try {
            if (!process.env.OSU_CLIENT_ID || !process.env.OSU_CLIENT_SECRET) {
                Logger.service(`OsuApiWrapper: V2 credentials not found, using V1`);
                this.v2Available = false;
                return;
            }
            if (!this.osuApiV2) {
                this.osuApiV2 = new OsuApiV2();
            }

            this.v2Available = true;
            Logger.service('OsuApiWrapper: V2 initialized and ready');
        } catch (error) {
            this.v2Available = false;
            Logger.errorCatch('OsuApiWrapper', `V2 initialization failed: ${error.message}`);
            Logger.service('OsuApiWrapper: Falling back to V1');
        }
    }
    forceV1() {
        this.preferV2 = true;
        Logger.service('OsuApiWrapper: Forced to use V1');
    }
    forceV2() {
        this.preferV2 = true;
        Logger.service('OsuApiWrapper: Forced to use V2');
    }
    async getUser(username, id) {
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();

            if (this.preferV2 && this.v2Available && this.osuApiV2) {
                try {
                    const userV2 = await this.osuApiV2.getUser(username, 'osu');
                    const duration = Date.now() - startTime;
                    await metricsCollector.recordServicePerformance('api', 'getUser', duration, 'wrapper_v2');

                    return {
                        locale: userV2.country_code,
                        id: userV2.id,
                        username: userV2.username,
                        pp: Math.round(userV2.statistics?.pp || 0)
                    };
                } catch (error) {
                    Logger.errorCatch('OsuApiWrapper', `V2 getUser failed, falling back to V1: ${error.message}`);
                    const userV1 = await OsuApiV1.getUser(username, id);
                    const duration = Date.now() - startTime;
                    await metricsCollector.recordServicePerformance('api', 'getUser', duration, 'wrapper_v1_fallback');

                    return userV1;
                }
            } else {
                const userV1 = await OsuApiV1.getUser(username, id);
                const duration = Date.now() - startTime;
                await metricsCollector.recordServicePerformance('api', 'getUser', duration, 'wrapper_v1');

                return userV1;
            }
        } finally {
            await metricsCollector.close();
        }
    }
    async getTop100MultiMods(userId, id) {
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();

            if (this.preferV2 && this.v2Available && this.osuApiV2) {
                try {
                    Logger.service(`OsuApiWrapper: Using V2 for getTop100MultiMods (${userId})`);
                    const result = await this.osuApiV2.getTop100MultiMods(userId, id);
                    const duration = Date.now() - startTime;
                    await metricsCollector.recordServicePerformance('api', 'getTop100MultiMods', duration, 'wrapper_v2');

                    return result;
                } catch (error) {
                    Logger.errorCatch('OsuApiWrapper', `V2 getTop100MultiMods failed, falling back to V1: ${error.message}`);
                    const result = await OsuApiV1.getTop100MultiMods(userId, id);
                    const duration = Date.now() - startTime;
                    await metricsCollector.recordServicePerformance('api', 'getTop100MultiMods', duration, 'wrapper_v1_fallback');

                    return result;
                }
            } else {
                Logger.service(`OsuApiWrapper: Using V1 for getTop100MultiMods (${userId})`);
                const result = await OsuApiV1.getTop100MultiMods(userId, id);
                const duration = Date.now() - startTime;
                await metricsCollector.recordServicePerformance('api', 'getTop100MultiMods', duration, 'wrapper_v1');

                return result;
            }
        } finally {
            await metricsCollector.close();
        }
    }
    async getBeatmap(beatmapId) {
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();

            if (this.preferV2 && this.v2Available && this.osuApiV2) {
                try {
                    const beatmapV2 = await this.osuApiV2.getBeatmap(beatmapId);
                    const duration = Date.now() - startTime;
                    await metricsCollector.recordServicePerformance('api', 'getBeatmap', duration, 'wrapper_v2');

                    return {
                        beatmap_id: beatmapV2.id.toString(),
                        beatmapset_id: beatmapV2.beatmapset_id.toString(),
                        title: beatmapV2.beatmapset.title,
                        artist: beatmapV2.beatmapset.artist,
                        creator: beatmapV2.beatmapset.creator,
                        version: beatmapV2.version,
                        source: beatmapV2.beatmapset.source || '',
                        tags: beatmapV2.beatmapset.tags || '',
                        bpm: beatmapV2.bpm?.toString() || '0',
                        diff_size: beatmapV2.cs?.toString() || '0',
                        diff_overall: beatmapV2.accuracy?.toString() || '0',
                        diff_approach: beatmapV2.ar?.toString() || '0',
                        diff_drain: beatmapV2.drain?.toString() || '0',
                        hit_length: beatmapV2.hit_length?.toString() || '0',
                        total_length: beatmapV2.total_length?.toString() || '0',
                        difficultyrating: beatmapV2.difficulty_rating?.toString() || '0',
                        mode: beatmapV2.mode_int?.toString() || '0'
                    };
                } catch (error) {
                    Logger.errorCatch('OsuApiWrapper', `V2 getBeatmap failed, falling back to V1: ${error.message}`);
                    const result = await OsuApiV1.getBeatmap(beatmapId);
                    const duration = Date.now() - startTime;
                    await metricsCollector.recordServicePerformance('api', 'getBeatmap', duration, 'wrapper_v1_fallback');

                    return result;
                }
            } else {
                const result = await OsuApiV1.getBeatmap(beatmapId);
                const duration = Date.now() - startTime;
                await metricsCollector.recordServicePerformance('api', 'getBeatmap', duration, 'wrapper_v1');

                return result;
            }
        } finally {
            await metricsCollector.close();
        }
    }
    async hasUserPlayedMap(userId, beatmapId) {
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();

            if (this.preferV2 && this.v2Available && this.osuApiV2) {
                try {
                    const score = await this.osuApiV2.getUserBeatmapScore(beatmapId, userId);
                    const duration = Date.now() - startTime;
                    await metricsCollector.recordServicePerformance('api', 'hasUserPlayedMap', duration, 'wrapper_v2');

                    return score && score.score;
                } catch (error) {
                    const result = await OsuApiV1.hasUserPlayedMap(userId, beatmapId);
                    const duration = Date.now() - startTime;
                    await metricsCollector.recordServicePerformance('api', 'hasUserPlayedMap', duration, 'wrapper_v1_fallback');

                    return result;
                }
            } else {
                const result = await OsuApiV1.hasUserPlayedMap(userId, beatmapId);
                const duration = Date.now() - startTime;
                await metricsCollector.recordServicePerformance('api', 'hasUserPlayedMap', duration, 'wrapper_v1');

                return result;
            }
        } finally {
            await metricsCollector.close();
        }
    }

    getUsageStats() {
        return {
            preferV2: this.preferV2,
            v2Available: this.v2Available,
            currentAPI: this.preferV2 && this.v2Available ? 'V2' : 'V1',
            v2AuthInfo: this.osuApiV2 ? this.osuApiV2.getAuthInfo() : null
        };
    }
    async recheckV2Availability() {
        await this.checkV2Availability();
        return this.v2Available;
    }

    async getBeatmapStarRating(beatmapId, mods = [], ruleset = 'osu') {
        if (!this.osuApiV2 || !this.v2Available) {
            await this.checkV2Availability();
        }
        if (!this.v2Available && process.env.OSU_CLIENT_ID && process.env.OSU_CLIENT_SECRET) {
            Logger.service('OsuApiWrapper: Retrying V2 initialization for getBeatmapStarRating');
            await this.checkV2Availability();
        }

        if (this.v2Available && this.osuApiV2) {
            try {
                return await this.osuApiV2.getBeatmapStarRating(beatmapId, mods, ruleset);
            } catch (error) {
                Logger.errorCatch('OsuApiWrapper', `V2 getBeatmapStarRating failed: ${error.message}`);
                throw new Error(`Star Rating not available: ${error.message}`);
            }
        } else {
            Logger.errorCatch('OsuApiWrapper', `V2 not available - v2Available: ${this.v2Available}, osuApiV2: ${!!this.osuApiV2}, hasCredentials: ${!!(process.env.OSU_CLIENT_ID && process.env.OSU_CLIENT_SECRET)}`);
            throw new Error('Star Rating with mods requires API V2 (not available in V1)');
        }
    }

    async getBeatmapAttributes(beatmapId, options = {}) {
        if (!this.osuApiV2) {
            await this.checkV2Availability();
        }

        if (this.v2Available && this.osuApiV2) {
            try {
                return await this.osuApiV2.getBeatmapAttributes(beatmapId, options);
            } catch (error) {
                Logger.errorCatch('OsuApiWrapper', `V2 getBeatmapAttributes failed: ${error.message}`);
                throw new Error(`Beatmap attributes not available: ${error.message}`);
            }
        } else {
            throw new Error('Beatmap attributes with mods requires API V2 (not available in V1)');
        }
    }


    async getBatchBeatmapStarRating(beatmapIds, mods = [], ruleset = 'osu') {
        if (!this.osuApiV2) {
            await this.checkV2Availability();
        }

        if (this.v2Available && this.osuApiV2) {
            try {
                return await this.osuApiV2.getBatchBeatmapStarRating(beatmapIds, mods, ruleset);
            } catch (error) {
                Logger.errorCatch('OsuApiWrapper', `V2 getBatchBeatmapStarRating failed: ${error.message}`);
                throw new Error(`Batch Star Rating not available: ${error.message}`);
            }
        } else {
            throw new Error('Batch Star Rating with mods requires API V2 (not available in V1)');
        }
    }

}

module.exports = OsuApiWrapper;
