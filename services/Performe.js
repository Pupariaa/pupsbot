const RedisManager = require('./Redis');

class Performe {
    constructor() {
        this._connected = false;
        this._redisManager = new RedisManager();
        this._redis = null;
    }

    async init() {
        if (!this._connected) {
            await this._redisManager.connect();
            this._redis = this._redisManager.instance;
            this._connected = true;
        }
    }

    async close() {
        if (this._connected) {
            try {
                await this._redis.quit();
            } catch (e) {

            }

            this._connected = false;
        }
    }

    async logDuration(commandName, durationMs) {
        await this._ensureReady();
        const key = `perf:duration:${commandName}`;
        const epoch = Date.now();
        await this._redis.zAdd(key, [{ score: epoch, value: durationMs.toString() }]);
    }

    async logCommand(userId, commandName) {
        await this._ensureReady();
        const key = `perf:command:${commandName}`;
        const epoch = Date.now();
        await this._redis.zAdd(key, [{ score: epoch, value: userId.toString() }]);
    }

    async logDBAccess(queryName, durationMs) {
        await this._ensureReady();
        const key = `perf:db:${queryName}`;
        const epoch = Date.now();
        await this._redis.zAdd(key, [{ score: epoch, value: durationMs.toString() }]);
    }

    startTimer() {
        const start = process.hrtime.bigint();
        return {
            stop: async (commandName) => {
                const end = process.hrtime.bigint();
                const durationMs = Number(end - start) / 1e6;
                await this.logDuration(commandName, durationMs);
                return durationMs;
            }
        };
    }

    async markPending(id, ttl = 30) {
        await this._ensureReady();
        const timestamp = Date.now();
        await this._redis.set(`pending:${id}`, '1', { EX: ttl });
        await this._redis.zAdd('unresolved:pending', [{ score: timestamp, value: id.toString() }]);
    }

    async markResolved(id) {
        await this._ensureReady();
        await this._redis.del(`pending:${id}`);
        await this._redis.zRem('unresolved:pending', id.toString());
    }

    async markCancelled(id) {
        await this._ensureReady();
        await this._redis.del(`pending:${id}`);
        await this._redis.zRem('unresolved:pending', id.toString());
        await this._redis.zAdd('cancelled:pending', [{ score: Date.now(), value: id.toString() }]);
    }

    async _ensureReady() {
        if (!this._connected) {
            await this.init();
        }
    }

    async _ensureReady() {
        if (!this._connected) {
            await this.init();
        }
    }

    async heartbeat() {
        await this._ensureReady();
        await this._redis.set('bot:main:heartbeat', Date.now().toString());
    }
}

module.exports = Performe;
