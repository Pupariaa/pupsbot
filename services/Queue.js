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
        this._startLoop();
    }

    async addToQueue(target, message, bypass = false) {
        const now = Date.now();

        if (!bypass) {
            if (this._blockedUsers.has(target) && now < this._blockedUsers.get(target)) {
                return;
            }

            const alreadyQueued = this._queue.filter(t => t.target === target).length;
            if (alreadyQueued >= 1) {
                this._queue = this._queue.filter(t => t.target !== target);
                this._blockedUsers.set(target, now + 30000);

                await this._sendFunction(
                    target,
                    `⛔ Please stop spamming. Your behavior causes delays for others... :(  You have been blocked for 30 seconds.`
                );
                return;
            }
        }

        return new Promise((resolve, reject) => {
            this._queue.push({
                target,
                message,
                retriesLeft: this._maxRetries,
                resolve,
                reject
            });

            if (this._enableLogs) {
                console.debug(`[IRCQueue] Queued "${message}" → ${target}${bypass ? ' (bypassed)' : ''}`);
            }
        });
    }

    _startLoop() {
        setInterval(() => {
            while (this._activeCount < this._maxConcurrent && this._queue.length > 0) {
                const task = this._queue.shift();
                this._processTask(task);
            }
        }, this._interval);
    }

    async _processTask(task) {
        this._activeCount++;
        try {
            await this._sendFunction(task.target, task.message);
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
