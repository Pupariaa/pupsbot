const RedisManager = require('./Redis');
const Logger = require('../utils/Logger');
const Notifier = require('./Notifier');
const MetricsCollector = require('./MetricsCollector');
const notifier = new Notifier();

class Performe {
    constructor() {
        this._connected = false;
        this._redisManager = new RedisManager();
        this._redis = null;
    }

    async init() {
        if (this._connected) return;
        try {
            await this._redisManager.connect();
            this._redis = this._redisManager.instance;
            this._connected = true;
        } catch (error) {
            Logger.errorCatch('PERFORME.INIT', error);
            await notifier.send(`Redis initialization error in Performe: ${error.message}`, 'PERFORME.INIT');
            throw error;
        }
    }

    async close() {
        if (!this._connected) return;
        try {
            await this._redis.quit();
            this._connected = false;
        } catch (error) {
            Logger.errorCatch('PERFORME.CLOSE', error);
            await notifier.send(`Redis shutdown error in Performe: ${error.message}`, 'PERFORME.CLOSE');
        }
    }

    async logDuration(command, durationMs) {
        try {
            await this._ensureReady();
            await this._redis.zAdd(`perf:duration:${command}`, [{ score: Date.now(), value: durationMs.toString() }]);
        } catch (error) {
            Logger.errorCatch('PERFORME.LOG_DURATION', error);
        }
    }

    async logCommand(userId, command) {
        try {
            await this._ensureReady();
            await this._redis.zAdd(`perf:command:${command}`, [{ score: Date.now(), value: userId.toString() }]);
        } catch (error) {
            Logger.errorCatch('PERFORME.LOG_COMMAND', error);
        }
    }

    async logDBAccess(queryName, durationMs) {
        try {
            await this._ensureReady();
            await this._redis.zAdd(`perf:db:${queryName}`, [{ score: Date.now(), value: durationMs.toString() }]);
        } catch (error) {
            Logger.errorCatch('PERFORME.LOG_DB_ACCESS', error);
        }
    }

    startTimer() {
        const start = process.hrtime.bigint();
        return {
            stop: async (command) => {
                const duration = Number(process.hrtime.bigint() - start) / 1e6;
                await this.logDuration(command, duration);
                return duration;
            }
        };
    }

    async markPending(id, ttl = 30) {
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();
            Logger.task(`Mark pending: ${id}`);
            await this._ensureReady();
            await this._redis.set(`pending:${id}`, '1', { EX: ttl });
            await this._redis.zAdd('unresolved:pending', [{ score: Date.now(), value: id.toString() }]);

            const duration = Date.now() - startTime;
            await metricsCollector.recordServicePerformance('redis', 'markPending', duration);

        } catch (error) {
            Logger.errorCatch('PERFORME.MARK_PENDING', error);
        } finally {
            await metricsCollector.close();
        }
    }

    async markResolved(id) {
        try {
            Logger.task(`Mark resolved: ${id}`);
            await this._ensureReady();
            await this._redis.del(`pending:${id}`);
            await this._redis.zRem('unresolved:pending', id.toString());
        } catch (error) {
            Logger.errorCatch('PERFORME.MARK_RESOLVED', error);
        }
    }

    async markCancelled(id, isError = false) {
        try {
            isError ? Logger.taskError(id) : Logger.taskRejected(id);
            await this._ensureReady();
            await this._redis.del(`pending:${id}`);
            await this._redis.zRem('unresolved:pending', id.toString());
            await this._redis.zAdd('cancelled:pending', [{ score: Date.now(), value: id.toString() }]);
        } catch (error) {
            Logger.errorCatch('PERFORME.MARK_CANCELLED', error);
        }
    }

    async trackSuggestedBeatmap(bmid, uid, length, id) {
        try {
            await this._ensureReady();
            await this._redis.hSet(`track:${id}`, { bmid, uid, length });
            await this._redis.expire(`track:${id}`, 86400); // 24h
            await this._redis.zAdd('trackers', [{ score: Date.now(), value: id }]);
        } catch (error) {
            Logger.errorCatch('PERFORME.TRACK_BM', error);
        }
    }

    async getAllTrackedSuggestions() {
        try {
            await this._ensureReady();
            const entries = await this._redis.zRangeByScore('trackers', 0, Date.now());
            const results = [];

            for (const id of entries) {
                const data = await this._redis.hGetAll(`track:${id}`);
                if (!data || !data.bmid || !data.uid || !data.length) continue;

                results.push({
                    id,
                    bmid: data.bmid,
                    uid: data.uid,
                    length: parseInt(data.length, 10)
                });

                await this._redis.zRem('trackers', id);
            }

            return results;
        } catch (error) {
            Logger.errorCatch('PERFORME.GET_TRACKED', error);
            return [];
        }
    }

    async addSuggestion(bmid, userId, ttl = 604800) {
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();
            await this._ensureReady();
            const key = `user:${userId}:suggested`;
            await this._redis.sAdd(key, bmid);
            await this._redis.expire(key, ttl);

            const duration = Date.now() - startTime;
            await metricsCollector.recordServicePerformance('redis', 'addSuggestion', duration);

        } catch (error) {
            Logger.errorCatch('PERFORME.ADD_SUGGESTION', error);
        } finally {
            await metricsCollector.close();
        }
    }

    async getUserSuggestions(userId) {
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();
            await this._ensureReady();
            const result = await this._redis.sMembers(`user:${userId}:suggested`);

            const duration = Date.now() - startTime;
            await metricsCollector.recordServicePerformance('redis', 'getUserSuggestions', duration);

            return result;
        } catch (error) {
            Logger.errorCatch('PERFORME.GET_SUGGESTIONS', error);
            return [];
        } finally {
            await metricsCollector.close();
        }
    }

    async heartbeat() {
        try {
            await this._ensureReady();
            await this._redis.set('bot:main:heartbeat', Date.now().toString());
        } catch (error) {
            Logger.errorCatch('PERFORME.HEARTBEAT', error);
        }
    }

    async _ensureReady() {
        if (!this._connected) {
            await this.init();
        }
    }
}

module.exports = Performe;
