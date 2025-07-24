const Performe = require('./Performe');
const Logger = require('../utils/Logger');
const Notifier = require('../services/Notifier');
const notifier = new Notifier();

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

        this._sendFunction = sendFunction;
        this._queue = [];
        this._activeCount = 0;
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

            const queuedCount = this._queue.filter(t => t.target === target).length;

            if (queuedCount >= 2) {
                const removed = this._queue.filter(t => t.target === target);
                this._queue = this._queue.filter(t => t.target !== target);
                this._blockedUsers.set(target, now + 30000);

                Logger.taskRejected(`Spam detected for ${target}, blocked for 30 seconds.`);

                try {
                    await this._sendFunction(
                        target,
                        `⛔ Please slow down. You are being temporarily blocked for 30 seconds due to message spam.`
                    );
                } catch (error) {
                    Logger.taskError(`Failed to notify ${target} about spam block: ${error.message}`);
                    await notifier.send(
                        `Failed to send spam warning to ${target}: ${error.message}`,
                        'IRCQUEUE.SPAM_MSG_FAIL'
                    );
                }

                for (const task of removed) {
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
                const short = message.length > 10 ? message.slice(0, 10) + '...' : message;
                Logger.queue(`Queued ${id} "${short}" → ${target}${bypass ? ' (bypass)' : ''}`);
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
        } catch (error) {
            if (task.retriesLeft > 0) {
                task.retriesLeft--;
                this._queue.push(task);
            } else {
                Logger.taskError(`Failed to send message to ${task.target}: ${error.message}`);
                await notifier.send(
                    `Failed to send IRC message to ${task.target} after ${this._maxRetries} attempts.\nMessage: "${task.message}"\nError: ${error.message}`,
                    'IRCQUEUE.FAILURE'
                );
                task.reject(error);
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
