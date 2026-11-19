const axios = require('axios');
const Logger = require('../utils/Logger');
const Notifier = require('./Notifier');
const MetricsCollector = require('./MetricsCollector');
const RedisStore = require('./RedisStore');
const { shouldSkipBackend } = require('./DegradedMode');

const REDIS_TOKEN_KEY = 'osu:oauth:client_credentials';
const REDIS_TOKEN_LOCK_KEY = 'osu:oauth:token_lock';
const TOKEN_LOCK_TTL_SEC = 60;
const MAX_TOKEN_RETRIES = 5;

const notifier = new Notifier();

let sharedInstance = null;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class OsuAuth {
    constructor() {
        if (sharedInstance) {
            return sharedInstance;
        }

        this.accessToken = null;
        this.expiresAt = null;
        this.clientId = process.env.OSU_CLIENT_ID;
        this.clientSecret = process.env.OSU_CLIENT_SECRET;
        this.baseUrl = 'https://osu.ppy.sh/oauth';
        this.tokenRefreshPromise = null;
        this.redis = null;
        this.redisInitPromise = null;

        if (!this.clientId || !this.clientSecret) {
            Logger.errorCatch('OsuAuth', `Missing OSU_CLIENT_ID or OSU_CLIENT_SECRET in environment variables. CLIENT_ID: ${this.clientId ? 'SET' : 'MISSING'}, CLIENT_SECRET: ${this.clientSecret ? 'SET' : 'MISSING'}`);
        }

        sharedInstance = this;
    }

    async _getRedis() {
        if (this.redis) {
            return this.redis;
        }

        if (!this.redisInitPromise) {
            this.redisInitPromise = (async () => {
                const store = new RedisStore();
                await store.init();
                this.redis = store;
                return store;
            })();
        }

        return this.redisInitPromise;
    }

    async _loadTokenFromRedis() {
        if (shouldSkipBackend()) {
            return false;
        }
        try {
            const redis = await this._getRedis();
            const data = await redis.get(REDIS_TOKEN_KEY);
            if (!data) {
                return false;
            }

            const parsed = JSON.parse(data);
            if (!parsed.accessToken || !parsed.expiresAt) {
                return false;
            }

            this.accessToken = parsed.accessToken;
            this.expiresAt = parsed.expiresAt;
            return this.isTokenValid();
        } catch (error) {
            Logger.errorCatch('OsuAuth', `Redis token load failed: ${error.message}`);
            return false;
        }
    }

    async _saveTokenToRedis() {
        if (shouldSkipBackend()) {
            return;
        }
        try {
            const redis = await this._getRedis();
            const ttlSec = Math.max(60, Math.floor((this.expiresAt - Date.now()) / 1000) - 300);
            await redis.setex(REDIS_TOKEN_KEY, ttlSec, JSON.stringify({
                accessToken: this.accessToken,
                expiresAt: this.expiresAt
            }));
        } catch (error) {
            Logger.errorCatch('OsuAuth', `Redis token save failed: ${error.message}`);
        }
    }

    async _clearTokenFromRedis() {
        if (shouldSkipBackend()) {
            return;
        }
        try {
            const redis = await this._getRedis();
            await redis.del(REDIS_TOKEN_KEY);
        } catch (error) {
            Logger.errorCatch('OsuAuth', `Redis token clear failed: ${error.message}`);
        }
    }

    async _acquireRefreshLock() {
        if (shouldSkipBackend()) {
            return true;
        }
        const redis = await this._getRedis();
        return redis.setNx(REDIS_TOKEN_LOCK_KEY, Date.now().toString(), TOKEN_LOCK_TTL_SEC);
    }

    async _releaseRefreshLock() {
        try {
            const redis = await this._getRedis();
            await redis.del(REDIS_TOKEN_LOCK_KEY);
        } catch (error) {
            Logger.errorCatch('OsuAuth', `Redis token lock release failed: ${error.message}`);
        }
    }

    async _waitForSharedToken(maxAttempts = 45) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (await this._loadTokenFromRedis() && this.isTokenValid()) {
                return true;
            }
            await sleep(1000);
        }
        return false;
    }

    _getRetryDelayMs(error, retryCount) {
        const headerRetryAfter = parseInt(error.response?.headers?.['retry-after'], 10);
        const bodyRetryAfter = parseInt(error.response?.data?.retry_after, 10);
        const baseDelaySec = headerRetryAfter || bodyRetryAfter || 30;
        return baseDelaySec * 1000 * Math.pow(2, retryCount);
    }

    async _fetchClientCredentialsToken(scope, retryCount = 0) {
        const metricsCollector = new MetricsCollector();
        const startTime = Date.now();

        try {
            await metricsCollector.init();

            const response = await axios.post(`${this.baseUrl}/token`, {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'client_credentials',
                scope
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            const tokenData = response.data;
            this.accessToken = tokenData.access_token;
            this.expiresAt = Date.now() + (tokenData.expires_in * 1000);

            await this._saveTokenToRedis();

            const duration = Date.now() - startTime;
            await metricsCollector.recordServicePerformance('api', 'getClientCredentialsToken', duration, 'auth');

            Logger.service('OsuAuth: Client credentials token successfully obtained');
            return tokenData;
        } catch (error) {
            const status = error.response?.status;
            const isRateLimited = status === 429 || error.response?.data?.error_code === 1015;

            if (isRateLimited && retryCount < MAX_TOKEN_RETRIES) {
                const waitMs = this._getRetryDelayMs(error, retryCount);
                Logger.service(`OsuAuth: Rate limited on token endpoint, retry ${retryCount + 1}/${MAX_TOKEN_RETRIES} in ${waitMs}ms`);
                await sleep(waitMs);
                return this._fetchClientCredentialsToken(scope, retryCount + 1);
            }

            const msg = `Error getting client credentials token: ${error.response?.data?.error || error.message}`;
            Logger.errorCatch('OsuAuth', msg);
            Logger.errorCatch('OsuAuth', `Full error: ${JSON.stringify(error.response?.data || error.message)}`);
            await notifier.send(msg, 'OSUAUTH.CLIENT_CREDENTIALS');
            throw new Error(msg);
        } finally {
            await metricsCollector.close();
        }
    }

    async getClientCredentialsToken(scope = 'public') {
        if (this.tokenRefreshPromise) {
            return this.tokenRefreshPromise;
        }

        this.tokenRefreshPromise = this._refreshClientCredentialsToken(scope)
            .finally(() => {
                this.tokenRefreshPromise = null;
            });

        return this.tokenRefreshPromise;
    }

    async _refreshClientCredentialsToken(scope) {
        if (this.isTokenValid()) {
            return {
                access_token: this.accessToken,
                expires_in: Math.max(0, Math.floor((this.expiresAt - Date.now()) / 1000))
            };
        }

        if (await this._loadTokenFromRedis() && this.isTokenValid()) {
            return {
                access_token: this.accessToken,
                expires_in: Math.max(0, Math.floor((this.expiresAt - Date.now()) / 1000))
            };
        }

        const lockAcquired = await this._acquireRefreshLock();
        if (!lockAcquired) {
            const tokenReady = await this._waitForSharedToken();
            if (tokenReady) {
                return {
                    access_token: this.accessToken,
                    expires_in: Math.max(0, Math.floor((this.expiresAt - Date.now()) / 1000))
                };
            }

            throw new Error('Error getting client credentials token: timed out waiting for shared token refresh');
        }

        try {
            if (await this._loadTokenFromRedis() && this.isTokenValid()) {
                return {
                    access_token: this.accessToken,
                    expires_in: Math.max(0, Math.floor((this.expiresAt - Date.now()) / 1000))
                };
            }

            return await this._fetchClientCredentialsToken(scope);
        } finally {
            await this._releaseRefreshLock();
        }
    }

    clearTokenData() {
        this.accessToken = null;
        this.expiresAt = null;
        this._clearTokenFromRedis().catch(() => {});
    }

    isTokenValid(bufferSeconds = 300) {
        if (!this.accessToken || !this.expiresAt) {
            return false;
        }

        const bufferMs = bufferSeconds * 1000;
        return Date.now() < (this.expiresAt - bufferMs);
    }

    async getValidAccessToken() {
        if (this.isTokenValid()) {
            return this.accessToken;
        }

        if (await this._loadTokenFromRedis() && this.isTokenValid()) {
            return this.accessToken;
        }

        await this.getClientCredentialsToken();
        return this.accessToken;
    }

    getTokenInfo() {
        return {
            hasToken: !!this.accessToken,
            isValid: this.isTokenValid(),
            expiresAt: this.expiresAt ? new Date(this.expiresAt) : null,
            timeToExpiry: this.expiresAt ? Math.max(0, this.expiresAt - Date.now()) : null
        };
    }
}

module.exports = OsuAuth;
