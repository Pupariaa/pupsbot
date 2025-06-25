const { Sequelize } = require('sequelize');
const SuggestedBeatmapModel = require('../models/SuggestedBeatmap');
const CommandHistoryModel = require('../models/CommandHistory');
const FeedBackModel = require('../models/FeedBack');
const Logger = require('../utils/Logger');

class Thread2Database {
    constructor() {
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

        this._connected = false;
    }

    async connect() {
        if (this._connected) return;

        try {
            await this.sequelize.authenticate();
            this._connected = true;
        } catch (err) {
            Logger.errorCatch('SQL', err);
            throw err;
        }
    }

    async disconnect() {
        if (!this._connected) return;

        try {
            await this.sequelize.close();
            this._connected = false;
        } catch (err) {
            Logger.errorCatch('SQL', err);
            throw err;

        }
    }

    async getSug(id) {
        const SuggestedBeatmap = SuggestedBeatmapModel(this.sequelize);
        return await SuggestedBeatmap.findAll({
            where: { user_id: id }
        });
    }

    async setSug(uid, bid) {
        const SuggestedBeatmap = SuggestedBeatmapModel(this.sequelize);
        await SuggestedBeatmap.upsert({
            user_id: uid,
            beatmap_id: bid,
            Date: new Date(),
        });
    }

    async setHistory(command_id, command_input, response, user_id, username, Success, elapsed_time, locale) {
        const CommandHistory = CommandHistoryModel(this.sequelize);
        await CommandHistory.upsert({
            command_id: command_id,
            command_input: command_input,
            response: response,
            user_id: user_id,
            username: username,
            Date: new Date(),
            Success: Success,
            elapsed_time: elapsed_time,
            locale: locale
        });
    }
    async saveFeedBack(command_id, result, user_id, username, locale) {
        const FeedBack = FeedBackModel(this.sequelize);
        try {
            await FeedBack.upsert({
                user_id: user_id,
                username: username,
                Date: new Date(),
                response: result,
                locale: locale
            });
        } catch (e) {
            console.error(e)
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
