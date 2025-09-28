const Logger = require('../../utils/Logger');

class RateLimiter {
    constructor(maxRequestsPerMinute = 60, maxBurstRequests = 10) {
        this.maxRequestsPerMinute = maxRequestsPerMinute;
        this.maxBurstRequests = maxBurstRequests;

        this.tokens = maxBurstRequests;
        this.lastRefill = Date.now();
        this.requestQueue = [];

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

    async waitForToken() {
        return new Promise((resolve) => {
            this.requestQueue.push(resolve);
            this.processQueue();
        });
    }

    processQueue() {
        this.refillTokens();
        this.cleanOldRequests();

        while (this.requestQueue.length > 0 && this.canMakeRequest()) {
            const resolve = this.requestQueue.shift();
            this.makeRequest();
            resolve();
        }

        if (this.requestQueue.length > 0) {
            setTimeout(() => this.processQueue(), 1000);
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

    async executeRequest(requestFunction) {
        await this.waitForToken();

        try {
            const result = await requestFunction();
            return result;
        } catch (error) {
            Logger.errorCatch('RateLimiter', `Request failed but token consumed: ${error.message}`);
            throw error;
        }
    }

    getStats() {
        this.refillTokens();
        this.cleanOldRequests();

        return {
            tokensAvailable: this.tokens,
            maxTokens: this.maxBurstRequests,
            requestsInLastMinute: this.requestHistory.length,
            maxRequestsPerMinute: this.maxRequestsPerMinute,
            queuedRequests: this.requestQueue.length,
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
