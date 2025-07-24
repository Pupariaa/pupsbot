const { createClient } = require('redis');
const Logger = require('../utils/Logger');
const Notifier = require('../services/Notifier');
const notifier = new Notifier();

class RedisManager {
    constructor() {
        this._connected = false;
        this._connecting = false;

        this.client = createClient({
            socket: {
                host: process.env.REDIS_HOST,
                port: parseInt(process.env.REDIS_PORT, 10),
                reconnectStrategy: (retries) => Math.min(retries * 50, 2000)
            }
        });

        this._setupEventHandlers();
    }

    _setupEventHandlers() {
        this.client.on('connect', () => {
            this._connected = true;
            this._connecting = false;
            Logger.redis('Connected to Redis server.');
        });

        this.client.on('error', async (error) => {
            Logger.redisErr('REDIS.ERROR', error);
            await notifier.send(`Redis error: ${error.message}`, 'REDIS.ERROR');
        });

        this.client.on('end', () => {
            this._connected = false;
            this._connecting = false;
            Logger.redis('Redis connection closed.');
        });
    }

    async connect(force = false) {
        if (this._connected && !force) return;
        if (this._connecting) return;

        this._connecting = true;

        try {
            await this.client.connect();
        } catch (error) {
            this._connected = false;
            this._connecting = false;

            Logger.redisErr('REDIS.CONNECT', error);
            await notifier.send(`Redis connection failed: ${error.message}`, 'REDIS.CONNECT');

            throw error;
        }
    }

    async quit() {
        if (!this._connected) return;

        try {
            await this.client.quit();
            this._connected = false;
        } catch (error) {
            Logger.redisErr('REDIS.QUIT', error);
            await notifier.send(`Error during Redis shutdown: ${error.message}`, 'REDIS.QUIT');
            throw error;
        }
    }

    get instance() {
        if (!this._connected) {
            Logger.redisErr('Redis client is not connected. Call connect() first.');
            return null;
        }

        return this.client;
    }

    isConnected() {
        return this._connected;
    }
}

module.exports = RedisManager;
