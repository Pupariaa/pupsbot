const Logger = require('../utils/Logger');

class UserRateLimiter {
    constructor(requestsPerSecond = 2, blockDurationMs = 30000) {
        this.requestsPerSecond = requestsPerSecond;
        this.blockDurationMs = blockDurationMs;
        this.windowMs = 1000; // 1 second window
        this.userData = new Map();
    }

    checkRateLimit(nick) {
        const now = Date.now();
        const userKey = nick.toLowerCase();

        if (!this.userData.has(userKey)) {
            this.userData.set(userKey, {
                requests: [],
                blockedUntil: 0
            });
        }

        const userData = this.userData.get(userKey);

        // Check if user is currently blocked
        if (now < userData.blockedUntil) {
            const remainingBlock = Math.ceil((userData.blockedUntil - now) / 1000);
            return {
                allowed: false,
                reason: 'blocked',
                remainingSeconds: remainingBlock
            };
        }

        // Clean old requests outside the window
        userData.requests = userData.requests.filter(timestamp => now - timestamp < this.windowMs);

        // Check if user has exceeded rate limit
        if (userData.requests.length >= this.requestsPerSecond) {
            userData.blockedUntil = now + this.blockDurationMs;
            userData.requests = []; // Reset requests
            return {
                allowed: false,
                reason: 'rate_limit_exceeded',
                remainingSeconds: Math.ceil(this.blockDurationMs / 1000)
            };
        }

        // Add current request
        userData.requests.push(now);

        return {
            allowed: true,
            reason: 'ok'
        };
    }

    getBlockMessage(rateLimitResult) {
        if (rateLimitResult.reason === 'blocked') {
            return `You are blocked for ${rateLimitResult.remainingSeconds} seconds due to rate limiting.`;
        } else if (rateLimitResult.reason === 'rate_limit_exceeded') {
            return `Rate limit exceeded! You are blocked for ${rateLimitResult.remainingSeconds} seconds. Maximum ${this.requestsPerSecond} commands per second.`;
        }
        return null;
    }

    logRateLimit(nick, rateLimitResult) {
        Logger.service(`[RATE-LIMIT] User ${nick} blocked: ${rateLimitResult.reason} (${rateLimitResult.remainingSeconds}s remaining)`);
    }

    // Clean up old user data to prevent memory leaks
    cleanup() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const [userKey, userData] of this.userData.entries()) {
            // Remove users who haven't made requests in 24 hours and aren't blocked
            const lastRequest = Math.max(...userData.requests, 0);
            if (now - lastRequest > maxAge && now >= userData.blockedUntil) {
                this.userData.delete(userKey);
            }
        }
    }

    // Get statistics
    getStats() {
        const now = Date.now();
        let activeUsers = 0;
        let blockedUsers = 0;

        for (const [userKey, userData] of this.userData.entries()) {
            if (userData.requests.length > 0) {
                activeUsers++;
            }
            if (now < userData.blockedUntil) {
                blockedUsers++;
            }
        }

        return {
            totalUsers: this.userData.size,
            activeUsers,
            blockedUsers,
            requestsPerSecond: this.requestsPerSecond,
            blockDurationMs: this.blockDurationMs
        };
    }
}

module.exports = UserRateLimiter;
