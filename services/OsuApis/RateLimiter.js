const Logger = require('../../utils/Logger');

class RateLimiter {
    constructor(corePerMinute = 60, coreBurst = 10, lowPerMinute = 60, lowBurst = 12) {
        this.corePerMinute = corePerMinute;
        this.lowPerMinute = lowPerMinute;
        this.core = this.makeBucket(corePerMinute, coreBurst);
        this.low = this.makeBucket(lowPerMinute, lowBurst);
        this.interactiveQueue = [];
        this.bulkQueue = [];
        this.reworkQueue = [];
        this.lowQueue = [];
        this.queueTimer = null;
        this.reworkMode = false;
        this.reworkSeenAt = 0;

        Logger.service(`RateLimiter: Initialized with ${corePerMinute} req/min direct and ${lowPerMinute} req/min relay`);
    }

    makeBucket(max, burst) {
        return { max, burst, tokens: burst, lastRefill: Date.now(), carry: 0, history: [] };
    }

    relayEnabled() {
        return Boolean(process.env.OSU_RELAY_URL && process.env.OSU_RELAY_SECRET);
    }

    lane(priority) {
        if ((priority === 'low' || priority === 'rework') && this.relayEnabled()) return this.low;
        return this.core;
    }

    refill(bucket) {
        const now = Date.now();
        const elapsed = now - bucket.lastRefill;
        if (elapsed <= 0) return;
        bucket.lastRefill = now;
        if (bucket.tokens >= bucket.burst) return;
        const raw = elapsed * (bucket.max / 60000) + bucket.carry;
        const tokensToAdd = Math.floor(raw);
        bucket.carry = raw - tokensToAdd;
        if (tokensToAdd > 0) bucket.tokens = Math.min(bucket.burst, bucket.tokens + tokensToAdd);
    }

    clean(bucket) {
        const oneMinuteAgo = Date.now() - 60000;
        bucket.history = bucket.history.filter(timestamp => timestamp > oneMinuteAgo);
    }

    refillTokens() {
        this.refill(this.core);
        this.refill(this.low);
    }

    cleanOldRequests() {
        this.clean(this.core);
        this.clean(this.low);
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

        while (this.interactiveQueue.length > 0 && this.canMakeRequest('interactive')) {
            const resolve = this.interactiveQueue.shift();
            this.makeRequest('interactive');
            resolve();
        }

        while (this.bulkQueue.length > 0 && this.canMakeRequest('bulk')) {
            const resolve = this.bulkQueue.shift();
            this.makeRequest('bulk');
            resolve();
        }

        while (this.reworkQueue.length > 0 && this.canMakeRequest('rework')) {
            const resolve = this.reworkQueue.shift();
            this.makeRequest('rework');
            resolve();
        }

        while (this.lowQueue.length > 0 && this.canMakeRequest('low')) {
            const resolve = this.lowQueue.shift();
            this.makeRequest('low');
            resolve();
        }

        if ((this.interactiveQueue.length > 0 || this.bulkQueue.length > 0 || this.reworkQueue.length > 0 || this.lowQueue.length > 0) && !this.queueTimer) {
            this.queueTimer = setTimeout(() => {
                this.queueTimer = null;
                this.processQueue();
            }, 500);
        }
    }

    canMakeRequest(priority = 'bulk') {
        const bucket = this.lane(priority);
        if (bucket.tokens <= 0) return false;
        if (bucket.history.length >= bucket.max) return false;
        return true;
    }

    makeRequest(priority = 'bulk') {
        const bucket = this.lane(priority);
        bucket.tokens--;
        bucket.history.push(Date.now());
        const lane = bucket === this.low ? 'relay' : 'direct';
        Logger.service(`RateLimiter: Request made. Lane: ${lane}, Tokens: ${bucket.tokens}, Requests/min: ${bucket.history.length}`);
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
        const relay = this.relayEnabled();
        const total = this.core.history.length + (relay ? this.low.history.length : 0);
        const totalMax = this.core.max + (relay ? this.low.max : 0);

        return {
            tokensAvailable: this.core.tokens,
            lowTokensAvailable: this.low.tokens,
            maxTokens: this.core.burst,
            requestsInLastMinute: total,
            coreRequestsInLastMinute: this.core.history.length,
            lowRequestsInLastMinute: relay ? this.low.history.length : 0,
            maxRequestsPerMinute: totalMax,
            coreRequestsPerMinute: this.core.max,
            lowRequestsPerMinute: this.low.max,
            queuedRequests: this.interactiveQueue.length + this.bulkQueue.length + this.reworkQueue.length + this.lowQueue.length,
            interactiveQueued: this.interactiveQueue.length,
            bulkQueued: this.bulkQueue.length,
            reworkQueued: this.reworkQueue.length,
            lowQueued: this.lowQueue.length,
            reworkMode: this.isReworkMode(),
            relay: relay ? 1 : 0,
            utilizationPercent: Math.round((total / totalMax) * 100)
        };
    }

    async waitIfNeeded() {
        if (!this.canMakeRequest()) {
            const waitTime = this.core.tokens <= 0 ? 1000 : 0;
            if (waitTime > 0) {
                Logger.service(`RateLimiter: Waiting ${waitTime}ms for token refill`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
}

module.exports = RateLimiter;
