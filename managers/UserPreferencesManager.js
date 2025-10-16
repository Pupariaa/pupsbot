/**
 * Manages user preferences stored in Redis
 * Handles command filters like mods, BPM, PP with fallback to defaults
 */

const RedisStore = require('../services/RedisStore');
const Logger = require('../utils/Logger');

class UserPreferencesManager {
    constructor() {
        this.redis = new RedisStore();
        this.defaultPreferences = {
            autoMods: true,
            mods: [],
            allowAnyMods: true,
            autoAlgorithm: true,
            algorithm: 'Base',
            autoPP: true,
            pp: null,
            autoBPM: true,
            bpm: null,
            mapperBan: [],
            titleBan: []
        };
    }

    /**
     * Initialize Redis connection
     */
    async init() {
        await this.redis.init();
    }

    /**
     * Get user preferences from Redis, fallback to defaults if not found
     * @param {number} userId - User ID
     * @returns {Object} User preferences with defaults applied
     */
    async getUserPreferences(userId) {
        try {
            const key = `user_preferences:${userId}`;
            const stored = await this.redis.get(key);

            if (!stored) {
                Logger.service(`[PREFERENCES] No stored preferences for user ${userId}, using defaults`);
                return { ...this.defaultPreferences };
            }

            const preferences = JSON.parse(stored);
            // Ensure all required fields exist with defaults
            const finalPreferences = {
                autoMods: preferences.autoMods !== undefined ? preferences.autoMods : this.defaultPreferences.autoMods,
                mods: preferences.mods || this.defaultPreferences.mods,
                allowAnyMods: preferences.allowAnyMods !== undefined ? preferences.allowAnyMods : this.defaultPreferences.allowAnyMods,
                autoAlgorithm: preferences.autoAlgorithm !== undefined ? preferences.autoAlgorithm : this.defaultPreferences.autoAlgorithm,
                algorithm: preferences.algorithm || this.defaultPreferences.algorithm,
                autoPP: preferences.autoPP !== undefined ? preferences.autoPP : this.defaultPreferences.autoPP,
                pp: preferences.pp || this.defaultPreferences.pp,
                autoBPM: preferences.autoBPM !== undefined ? preferences.autoBPM : this.defaultPreferences.autoBPM,
                bpm: preferences.bpm || this.defaultPreferences.bpm,
                mapperBan: preferences.mapperBan || this.defaultPreferences.mapperBan,
                titleBan: preferences.titleBan || this.defaultPreferences.titleBan
            };

            return finalPreferences;
        } catch (error) {
            Logger.errorCatch('getUserPreferences', error);
            Logger.service(`[PREFERENCES] Error loading preferences for user ${userId}, using defaults`);
            return { ...this.defaultPreferences };
        }
    }

    /**
     * Update user preferences in Redis (no TTL = permanent storage)
     * @param {number} userId - User ID
     * @param {Object} preferences - New preferences to store
     * @param {string[]} [preferences.mods] - Preferred mods (e.g. ['HD', 'HR', 'DT'])
     * @param {boolean} [preferences.allowOtherMods] - Allow other mods in combination
     * @param {number} [preferences.bpm] - Preferred BPM range
     * @param {number} [preferences.pp] - Preferred PP range
     */
    async setUserPreferences(userId, preferences) {
        try {
            const key = `user_preferences:${userId}`;
            const sanitizedPreferences = this._sanitizePreferences(preferences);

            await this.redis.set(key, JSON.stringify(sanitizedPreferences)); // No TTL = permanent storage
        } catch (error) {
            Logger.errorCatch('setUserPreferences', error);
        }
    }

    /**
     * Merge command parameters with user preferences
     * If auto flags are false, use stored preferences; otherwise use command params
     * @param {number} userId - User ID
     * @param {Object} commandParams - Parameters from command (!o)
     * @returns {Object} Merged preferences based on auto flags
     */
    async getEffectivePreferences(userId, commandParams) {
        const userPreferences = await this.getUserPreferences(userId);
        const effectiveParams = { ...commandParams };

        // If auto flags are false, use stored preferences instead of command params
        if (!userPreferences.autoMods) {
            effectiveParams.mods = userPreferences.mods;
            effectiveParams.allowOtherMods = userPreferences.allowAnyMods;
        }

        if (!userPreferences.autoAlgorithm) {
            effectiveParams.algorithm = userPreferences.algorithm;
        }

        if (!userPreferences.autoPP) {
            effectiveParams.pp = userPreferences.pp;
        }

        if (!userPreferences.autoBPM) {
            effectiveParams.bpm = userPreferences.bpm;
        }

        return effectiveParams;
    }

    /**
     * Reset user preferences to defaults
     * @param {number} userId - User ID
     */
    async resetUserPreferences(userId) {
        try {
            const key = `user_preferences:${userId}`;
            await this.redis.del(key);
        } catch (error) {
            Logger.errorCatch('resetUserPreferences', error);
        }
    }

    /**
     * Get supported mods list (from default preferences)
     * @returns {string[]} List of supported mod abbreviations
     */
    getSupportedMods() {
        return ['HD', 'HR', 'DT', 'NC', 'EZ'];
    }

    /**
     * Sanitize preferences object to ensure valid values
     * @param {Object} preferences - Raw preferences object
     * @returns {Object} Sanitized preferences
     */
    _sanitizePreferences(preferences) {
        const sanitized = {};

        // Auto flags: boolean
        sanitized.autoMods = Boolean(preferences.autoMods);
        sanitized.autoAlgorithm = Boolean(preferences.autoAlgorithm);
        sanitized.autoPP = Boolean(preferences.autoPP);
        sanitized.autoBPM = Boolean(preferences.autoBPM);

        // Mods: array of strings, filter unsupported
        if (preferences.mods && Array.isArray(preferences.mods)) {
            const supportedMods = this.getSupportedMods();
            sanitized.mods = preferences.mods.filter(mod =>
                typeof mod === 'string' && supportedMods.includes(mod.toUpperCase())
            ).map(mod => mod.toUpperCase());
        } else {
            sanitized.mods = [];
        }

        // AllowAnyMods: boolean
        sanitized.allowAnyMods = Boolean(preferences.allowAnyMods);

        // Algorithm: string
        sanitized.algorithm = typeof preferences.algorithm === 'string' ? preferences.algorithm : 'Base';

        // BPM: positive number or null
        sanitized.bpm = (preferences.bpm && preferences.bpm > 0) ? Number(preferences.bpm) : null;

        // PP: positive number or null  
        sanitized.pp = (preferences.pp && preferences.pp > 0) ? Number(preferences.pp) : null;

        // MapperBan: array of strings
        if (preferences.mapperBan && Array.isArray(preferences.mapperBan)) {
            sanitized.mapperBan = preferences.mapperBan.filter(mapper =>
                typeof mapper === 'string' && mapper.trim().length > 0
            ).map(mapper => mapper.trim().toLowerCase());
        } else {
            sanitized.mapperBan = [];
        }

        // TitleBan: array of strings
        if (preferences.titleBan && Array.isArray(preferences.titleBan)) {
            sanitized.titleBan = preferences.titleBan.filter(title =>
                typeof title === 'string' && title.trim().length > 0
            ).map(title => title.trim().toLowerCase());
        } else {
            sanitized.titleBan = [];
        }

        return sanitized;
    }

    /**
     * Close Redis connection
     */
    async close() {
        await this.redis.close();
    }
}

module.exports = UserPreferencesManager;
