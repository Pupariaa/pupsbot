const RedisManager = require('./Redis');
const Logger = require('../utils/Logger');

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

    async markPending(id, ttl = 30) {
        Logger.task(`Pending ${id}`);
        await this._ensureReady();
        const timestamp = Date.now();
        await this._redis.set(`pending:${id}`, '1', { EX: ttl });
        await this._redis.zAdd('unresolved:pending', [{ score: timestamp, value: id.toString() }]);
    }

    async markResolved(id) {
        Logger.task(`Resolved ${id}`);
        await this._ensureReady();
        await this._redis.del(`pending:${id}`);
        await this._redis.zRem('unresolved:pending', id.toString());
    }

    async markCancelled(id, error = false) {
        Logger.taskError(`${id}`);
        error ? Logger.taskError(id) : Logger.taskRejected(id);
        await this._ensureReady();
        await this._redis.del(`pending:${id}`);
        await this._redis.zRem('unresolved:pending', id.toString());
        await this._redis.zAdd('cancelled:pending', [{ score: Date.now(), value: id.toString() }]);
    }
    async trackSuggestedBeatmap(bmid, uid, length, id) {
        await this._redis.hSet(`track:${id}`, {
            bmid,
            uid,
            length
        });
        await this._redis.expire(`track:${id}`, 86400);
        await this._redis.zAdd('trackers', [{ score: Date.now(), value: id }]);
    }

    async getAllTrackedSuggestions() {
        const now = Date.now();
        const results = [];

        const entries = await this._redis.zRangeByScore('trackers', 0, now);

        for (const id of entries) {
            const data = await this._redis.hGetAll(`track:${id}`);
            if (!data || !data.bmid || !data.uid || !data.length) continue;

            results.push({
                id,
                bmid: data.bmid,
                uid: data.uid,
                length: parseInt(data.length)
            });
            await this._redis.zRem('trackers', id);
        }

        return results;
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
