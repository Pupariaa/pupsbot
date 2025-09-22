const { createClient } = require('redis');
const Logger = require('../utils/Logger');
const Notifier = require('../services/Notifier');
const MetricsCollector = require('./MetricsCollector');
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
            },
            database: parseInt('0', 10)
        });

        this._setupEventHandlers();
    }

    _setupEventHandlers() {
        this.client.on('connect', () => {
            this._connected = true;
            this._connecting = false;
        });

        this.client.on('error', async (error) => {
            Logger.redisErr('REDIS.ERROR', error);
            await notifier.send(`Redis error: ${error.message}`, 'REDIS.ERROR');
        });

        this.client.on('end', () => {
            this._connected = false;
            this._connecting = false;
        });
    }

    async connect(force = false) {
        if (this._connected && !force) return;
        if (this._connecting) return;

        this._connecting = true;
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();
            await this.client.connect();

            const duration = Date.now() - startTime;
            await metricsCollector.recordServicePerformance('redis', 'connect', duration);

        } catch (error) {
            this._connected = false;
            this._connecting = false;

            Logger.redisErr('REDIS.CONNECT', error);
            await notifier.send(`Redis connection failed: ${error.message}`, 'REDIS.CONNECT');

            throw error;
        } finally {
            await metricsCollector.close();
        }
    }

    async quit() {
        if (!this._connected) return;

        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();
            await this.client.quit();
            this._connected = false;

            const duration = Date.now() - startTime;
            await metricsCollector.recordServicePerformance('redis', 'quit', duration);

        } catch (error) {
            Logger.redisErr('REDIS.QUIT', error);
            await notifier.send(`Error during Redis shutdown: ${error.message}`, 'REDIS.QUIT');
            throw error;
        } finally {
            await metricsCollector.close();
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
