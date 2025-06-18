const { Sequelize } = require('sequelize');
const SuggestedBeatmapModel = require('../models/SuggestedBeatmap');
const CommandHistoryModel = require('../models/CommandHistory');

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
            console.log(`${new Date().toLocaleString('fr-FR')} [DB:Thread2] Connected successfully.`);
        } catch (err) {
            console.error(`${new Date().toLocaleString('fr-FR')} [DB:Thread2 Connection failed:`, err);
            throw err;
        }
    }

    async disconnect() {
        if (!this._connected) return;

        try {
            await this.sequelize.close();
            this._connected = false;
            console.log(`${new Date().toLocaleString('fr-FR')} [DB:Thread2] Disconnected.`);
        } catch (err) {
            console.error(`${new Date().toLocaleString('fr-FR')} [DB:Thread2 Error during disconnect:`, err);
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




    get instance() {
        if (!this._connected) {
            throw new Error(`${new Date().toLocaleString('fr-FR')} [DB:Thread2] Database is not connected. Call connect() first.`);
        }
        return this.sequelize;
    }
}

module.exports = Thread2Database;
