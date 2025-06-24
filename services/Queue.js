const Performe = require('./Performe');
const Logger = require('../utils/Logger');

class IRCQueueManager {
    constructor(sendFunction, options = {}) {
        if (typeof sendFunction !== 'function') {
            throw new TypeError('sendFunction must be a function.');
        }

        const {
            maxConcurrent = 2,
            ratePerSecond = 2,
            maxRetries = 2,
            enableLogs = false
        } = options;

        this._queue = [];
        this._activeCount = 0;
        this._sendFunction = sendFunction;
        this._maxConcurrent = maxConcurrent;
        this._interval = 1000 / ratePerSecond;
        this._maxRetries = maxRetries;
        this._enableLogs = enableLogs;

        this._blockedUsers = new Map();
        this._performe = new Performe();
        this._performe.init();
        this._startLoop();
    }

    async addToQueue(target, message, bypass = false, id = null, success = true) {
        const now = Date.now();

        if (!bypass) {
            if (this._blockedUsers.has(target) && now < this._blockedUsers.get(target)) {
                if (id && success === false) {
                    await this._performe.markCancelled(id);
                }
                return;
            }

            const alreadyQueued = this._queue.filter(t => t.target === target).length;
            if (alreadyQueued >= 2) {
                const removedTasks = this._queue.filter(t => t.target === target);

                this._queue = this._queue.filter(t => t.target !== target);
                this._blockedUsers.set(target, now + 30000);

                await this._sendFunction(
                    target,
                    `⛔ Please stop spamming... Your behavior causes delays for others... :(  You have been blocked for 30 seconds.`
                );
                for (const task of removedTasks) {
                    if (task.id) {
                        await this._performe.markCancelled(task.id);
                    }
                }
                if (id) {
                    await this._performe.markCancelled(id);
                }

                return;
            }

        }

        return new Promise((resolve, reject) => {
            this._queue.push({
                target,
                message,
                retriesLeft: this._maxRetries,
                id,
                success,
                resolve,
                reject
            });

            if (this._enableLogs) {
                const shortMsg = message.length > 10 ? message.slice(0, 10) + '...' : message;
                Logger.queue(`Queued ${id} "${shortMsg}" → ${target}${bypass ? ' (bypassed)' : ''}`);
            }
        });
    }

    _startLoop() {
        setInterval(async () => {
            while (this._activeCount < this._maxConcurrent && this._queue.length > 0) {
                const task = this._queue.shift();

                if (task.success === false && task.id) {
                    await this._performe.markCancelled(task.id);
                    continue;
                }

                this._processTask(task);
            }
        }, this._interval);
    }

    async _processTask(task) {
        this._activeCount++;
        try {
            await this._sendFunction(task.target, task.message);
            if (task.id) {
                await this._performe.markResolved(task.id);
            }
            task.resolve();
        } catch (err) {
            if (task.retriesLeft > 0) {
                task.retriesLeft--;
                this._queue.push(task);
            } else {
                task.reject(err);
            }
        } finally {
            this._activeCount--;
        }
    }

    isIdle() {
        return this._queue.length === 0 && this._activeCount === 0;
    }
}

module.exports = IRCQueueManager;
