const { Sequelize } = require('sequelize');
const SuggestedBeatmapModel = require('../models/SuggestedBeatmap');
const CommandHistoryModel = require('../models/CommandHistory');
const FeedBackModel = require('../models/FeedBack');
const Logger = require('../utils/Logger');
const Notifier = require('../services/Notifier');

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
            FeedBack: FeedBackModel(this.sequelize)
        };
    }

    async connect() {
        if (this._connected) return;

        try {
            await this.sequelize.authenticate();
            this._connected = true;
        } catch (error) {
            Logger.errorCatch('DB.CONNECT', error);
            await notifier.send(`Database connection failed: ${error.message}`, 'DB.CONNECT');
            throw error;
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

    async saveSuggestion(userId, beatmapId, eventId, ppTarget) {
        try {
            await this._models.SuggestedBeatmap.upsert({
                user_id: userId,
                beatmap_id: beatmapId,
                event_id: eventId,
                Date: new Date(),
                pp_target: ppTarget
            });
        } catch (error) {
            Logger.errorCatch('DB.SAVE_SUGGESTION', error);
            await notifier.send(`Failed to save suggestion for user ${userId} - beatmap ${beatmapId}: ${error.message}`, 'DB.SAVE_SUGGESTION');
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

    async saveCommandHistory(commandId, input, response, userId, username, success, durationMs, locale) {
        try {
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
        } catch (error) {
            Logger.errorCatch('DB.SAVE_HISTORY', error);
            await notifier.send(`Failed to save command history for ${commandId}: ${error.message}`, 'DB.SAVE_HISTORY');
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

    get instance() {
        if (!this._connected) {
            Logger.error('Database is not connected. Call connect() first.');
            return null;
        }

        return this.sequelize;
    }
}

module.exports = Thread2Database;
