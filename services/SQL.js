const { Sequelize } = require('sequelize');
const SuggestedBeatmapModel = require('../models/SuggestedBeatmap');
const CommandHistoryModel = require('../models/CommandHistory');
const BeatmapModel = require('../models/Beatmaps');
const FeedBackModel = require('../models/FeedBack');
const Logger = require('../utils/Logger');
const Notifier = require('../services/Notifier');
const MetricsCollector = require('./MetricsCollector');

const notifier = new Notifier();

class Thread2Database {
    constructor() {
        this._connected = false;

        this.sequelize = new Sequelize(
            process.env.LOGS_DB_NAME,
            process.env.LOGS_DB_USER,
            process.env.LOGS_DB_PASS,
            {
                host: process.env.LOGS_DB_HOST,
                dialect: process.env.LOGS_DB_DIALECT || 'mysql',
                logging: false
            }
        );

        this._models = {
            SuggestedBeatmap: SuggestedBeatmapModel(this.sequelize),
            CommandHistory: CommandHistoryModel(this.sequelize),
            FeedBack: FeedBackModel(this.sequelize),
            Beatmap: BeatmapModel(this.sequelize)
        };
    }

    async connect() {
        if (this._connected) return;

        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();
            await this.sequelize.authenticate();
            this._connected = true;

            const duration = Date.now() - startTime;
            await metricsCollector.recordServicePerformance('db', 'connect', duration);

        } catch (error) {
            Logger.errorCatch('DB.CONNECT', error);
            await notifier.send(`Database connection failed: ${error.message}`, 'DB.CONNECT');
            throw error;
        } finally {
            await metricsCollector.close();
        }
    }

    async disconnect() {
        if (!this._connected) return;

        try {
            await this.sequelize.close();
            this._connected = false;
        } catch (error) {
            Logger.errorCatch('DB.DISCONNECT', error);
            await notifier.send(`Database disconnection failed: ${error.message}`, 'DB.DISCONNECT');
            throw error;
        }
    }

    async getSuggestions(userId) {
        try {
            return await this._models.SuggestedBeatmap.findAll({ where: { user_id: userId } });
        } catch (error) {
            Logger.errorCatch('DB.GET_SUGGESTIONS', error);
            await notifier.send(`Failed to get suggestions for user ${userId}: ${error.message}`, 'DB.GET_SUGGESTIONS');
            return [];
        }
    }

    async saveSuggestion(userId, beatmapId, eventId, ppTarget, mods) {
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();
            await this._models.SuggestedBeatmap.upsert({
                user_id: userId,
                beatmap_id: beatmapId,
                event_id: eventId,
                Date: new Date(),
                pp_target: ppTarget,
                mods: mods,
                nv: true
            });

            const duration = Date.now() - startTime;
            await metricsCollector.recordServicePerformance('db', 'saveSuggestion', duration);

        } catch (error) {
            Logger.errorCatch('DB.SAVE_SUGGESTION', error);
            await notifier.send(`Failed to save suggestion for user ${userId} - beatmap ${beatmapId}: ${error.message}`, 'DB.SAVE_SUGGESTION');
        } finally {
            await metricsCollector.close();
        }
    }

    async updateSuggestion(eventId, ppEarled) {
        try {
            await this._models.SuggestedBeatmap.update(
                { pp_earled: ppEarled },
                { where: { event_id: eventId } }
            );
        } catch (error) {
            Logger.errorCatch('DB.UPDATE_SUGGESTION', error);
            await notifier.send(`Failed to update suggestion for event ${eventId}: ${error.message}`, 'DB.UPDATE_SUGGESTION');
        }
    }
    async setSug(uid, bid, event_id, pp_target) {
        try {
            const SuggestedBeatmap = SuggestedBeatmapModel(this.sequelize);
            await SuggestedBeatmap.upsert({
                user_id: uid,
                beatmap_id: bid,
                event_id: event_id,
                Date: new Date(),
                pp_target: pp_target
            });
        } catch (err) {
            Logger.errorCatch('DB.SET_SUG', err);
            await notifier.send(`Error DB.setSug(${uid}, ${bid}): ${err.message}`, 'DB.SET_SUG');
        }
    }

    async saveCommandHistory(commandId, input, response, userId, username, success, durationMs, locale) {
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();
            await this._models.CommandHistory.upsert({
                command_id: commandId,
                command_input: input,
                response: response,
                user_id: userId,
                username: username,
                Date: new Date(),
                Success: success,
                elapsed_time: durationMs,
                locale: locale
            });

            const duration = Date.now() - startTime;
            await metricsCollector.recordServicePerformance('db', 'saveCommandHistory', duration);

        } catch (error) {
            Logger.errorCatch('DB.SAVE_HISTORY', error);
            await notifier.send(`Failed to save command history for ${commandId}: ${error.message}`, 'DB.SAVE_HISTORY');
        } finally {
            await metricsCollector.close();
        }
    }

    async saveFeedback(commandId, result, userId, username, locale) {
        try {
            await this._models.FeedBack.upsert({
                user_id: userId,
                username: username,
                Date: new Date(),
                response: result,
                locale: locale
            });
        } catch (error) {
            Logger.errorCatch('DB.SAVE_FEEDBACK', error);
            await notifier.send(`Failed to save feedback for command ${commandId}: ${error.message}`, 'DB.SAVE_FEEDBACK');
        }
    }

    async saveBeatmap(beatmap) {
        try {
            await this._models.Beatmap.findOrCreate({
                where: {
                    beatmapId: beatmap.beatmapId,
                    mods: beatmap.mods ?? null
                },
                defaults: {
                    beatmapId: beatmap.beatmapId,
                    beatmapsetId: beatmap.beatmapsetId ?? null,
                    title: beatmap.title ?? null,
                    author: beatmap.author ?? null,
                    mapper: beatmap.mapper ?? null,
                    diffName: beatmap.diffName ?? null,
                    length: beatmap.length ?? null,
                    cs: beatmap.cs ?? null,
                    od: beatmap.od ?? null,
                    hp: beatmap.hp ?? null,
                    sr: beatmap.sr ?? null,
                    ar: beatmap.ar ?? null,
                    bpm: beatmap.bpm ?? null,
                    cLength: beatmap.cLength ?? null,
                    cCs: beatmap.cCs ?? null,
                    cOd: beatmap.cOd ?? null,
                    cHp: beatmap.cHp ?? null,
                    cSr: beatmap.cSr ?? null,
                    cAr: beatmap.cAr ?? null,
                    cBpm: beatmap.cBpm ?? null,
                    mods: beatmap.mods ?? null
                }
            });
        } catch (error) {
            Logger.errorCatch('DB.SAVE_BEATMAP', error);
            await notifier.send(`Failed to save beatmap for beatmap ${beatmap.beatmapId}: ${error.message}`, 'DB.SAVE_BEATMAP');
        }
    }

    get instance() {
        if (!this._connected) {
            Logger.error('Database is not connected. Call connect() first.');
            return null;
        }

        return this.sequelize;
    }
}

module.exports = Thread2Database;
