const { createClient } = require('redis');

class RedisManager {
    constructor() {
        this.client = createClient({
            socket: {
                host: process.env.REDIS_HOST,
                port: parseInt(process.env.REDIS_PORT, 10),
                reconnectStrategy: retries => Math.min(retries * 50, 2000)
            }
        });

        this._setupEvents();
        this._connected = false;
    }

    _setupEvents() {
        this.client.on('connect', () => {
            console.log('[Redis] Connected.');
        });

        this.client.on('error', (err) => {
            console.error('[Redis] Error:', err);
        });

        this.client.on('end', () => {
            console.log('[Redis] Connection closed.');
        });
    }

    async connect() {
        if (!this._connected) {
            await this.client.connect();
            this._connected = true;
        }
    }

    async quit() {
        if (this._connected) {
            await this.client.quit();
            this._connected = false;
        }
    }

    get instance() {
        if (!this._connected) {
            throw new Error('Redis client not connected. Call connect() first.');
        }
        return this.client;
    }
}

module.exports = RedisManager;
