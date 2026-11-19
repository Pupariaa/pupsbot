const Logger = require('../../utils/Logger');

class RateLimiter {
    constructor(maxRequestsPerMinute = 60, maxBurstRequests = 10) {
        this.maxRequestsPerMinute = maxRequestsPerMinute;
        this.maxBurstRequests = maxBurstRequests;

        this.tokens = maxBurstRequests;
        this.lastRefill = Date.now();
        this.interactiveQueue = [];
        this.bulkQueue = [];
        this.reworkQueue = [];
        this.lowQueue = [];
        this.queueTimer = null;
        this.reworkMode = false;
        this.reworkSeenAt = 0;
        this.lastLowDispatch = 0;

        this.requestHistory = [];

        Logger.service(`RateLimiter: Initialized with ${maxRequestsPerMinute} req/min limit and ${maxBurstRequests} burst capacity`);
    }

    refillTokens() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const tokensToAdd = Math.floor(timePassed / 1000);

        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.maxBurstRequests, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    cleanOldRequests() {
        const oneMinuteAgo = Date.now() - 60000;
        this.requestHistory = this.requestHistory.filter(timestamp => timestamp > oneMinuteAgo);
    }

    async waitForToken(priority = 'bulk') {
        return new Promise((resolve) => {
            if (priority === 'interactive') {
                this.interactiveQueue.push(resolve);
            } else if (priority === 'rework') {
                this.reworkQueue.push(resolve);
            } else if (priority === 'low') {
                this.lowQueue.push(resolve);
            } else {
                this.bulkQueue.push(resolve);
            }
            this.processQueue();
        });
    }

    processQueue() {
        this.refillTokens();
        this.cleanOldRequests();

        while (this.interactiveQueue.length > 0 && this.canMakeRequest()) {
            const resolve = this.interactiveQueue.shift();
            this.makeRequest();
            resolve();
        }

        while (this.bulkQueue.length > 0 && this.canMakeRequest()) {
            const resolve = this.bulkQueue.shift();
            this.makeRequest();
            resolve();
        }

        const reworkActive = this.isReworkMode();

        if (reworkActive) {
            if (this.lowQueue.length > 0 && this.canMakeRequest() && Date.now() - this.lastLowDispatch >= 60000) {
                const resolve = this.lowQueue.shift();
                this.makeRequest();
                this.lastLowDispatch = Date.now();
                resolve();
            }

            while (this.reworkQueue.length > 0 && this.canMakeRequest()) {
                const resolve = this.reworkQueue.shift();
                this.makeRequest();
                resolve();
            }
        } else {
            while (this.reworkQueue.length > 0 && this.canMakeRequest()) {
                const resolve = this.reworkQueue.shift();
                this.makeRequest();
                resolve();
            }

            while (this.lowQueue.length > 0 && this.canMakeRequest()) {
                const resolve = this.lowQueue.shift();
                this.makeRequest();
                resolve();
            }
        }

        if ((this.interactiveQueue.length > 0 || this.bulkQueue.length > 0 || this.reworkQueue.length > 0 || this.lowQueue.length > 0) && !this.queueTimer) {
            this.queueTimer = setTimeout(() => {
                this.queueTimer = null;
                this.processQueue();
            }, 1000);
        }
    }

    canMakeRequest() {
        if (this.tokens <= 0) {
            return false;
        }

        if (this.requestHistory.length >= this.maxRequestsPerMinute) {
            return false;
        }

        return true;
    }

    makeRequest() {
        this.tokens--;
        this.requestHistory.push(Date.now());

        Logger.service(`RateLimiter: Request made. Tokens: ${this.tokens}, Requests/min: ${this.requestHistory.length}`);
    }

    setReworkMode(active) {
        this.reworkMode = active === true;
        this.reworkSeenAt = Date.now();
        Logger.service(`RateLimiter: rework mode ${this.reworkMode ? 'on' : 'off'}`);
    }

    touchRework() {
        this.reworkMode = true;
        this.reworkSeenAt = Date.now();
    }

    isReworkMode() {
        if (!this.reworkMode) {
            return false;
        }
        if (Date.now() - this.reworkSeenAt > 120000) {
            this.reworkMode = false;
            Logger.service('RateLimiter: rework mode expired');
            return false;
        }
        return true;
    }

    async executeRequest(requestFunction, priority = 'bulk') {
        await this.waitForToken(priority);
        return await requestFunction();
    }

    getStats() {
        this.refillTokens();
        this.cleanOldRequests();

        return {
            tokensAvailable: this.tokens,
            maxTokens: this.maxBurstRequests,
            requestsInLastMinute: this.requestHistory.length,
            maxRequestsPerMinute: this.maxRequestsPerMinute,
            queuedRequests: this.interactiveQueue.length + this.bulkQueue.length + this.reworkQueue.length + this.lowQueue.length,
            interactiveQueued: this.interactiveQueue.length,
            bulkQueued: this.bulkQueue.length,
            reworkQueued: this.reworkQueue.length,
            lowQueued: this.lowQueue.length,
            reworkMode: this.isReworkMode(),
            utilizationPercent: Math.round((this.requestHistory.length / this.maxRequestsPerMinute) * 100)
        };
    }

    async waitIfNeeded() {
        if (!this.canMakeRequest()) {
            const waitTime = this.tokens <= 0 ? 1000 : 0; // Wait 1 second if no tokens
            if (waitTime > 0) {
                Logger.service(`RateLimiter: Waiting ${waitTime}ms for token refill`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
}

module.exports = RateLimiter;
