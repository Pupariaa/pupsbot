const axios = require('axios');
const Logger = require('../utils/Logger');
const Notifier = require('./Notifier');
const notifier = new Notifier();

class OsuAuth {
    constructor() {
        this.accessToken = null;
        this.expiresAt = null;
        this.clientId = process.env.OSU_CLIENT_ID;
        this.clientSecret = process.env.OSU_CLIENT_SECRET;
        this.baseUrl = 'https://osu.ppy.sh/oauth';

        if (!this.clientId || !this.clientSecret) {
            Logger.errorCatch('OsuAuth', 'Missing OSU_CLIENT_ID or OSU_CLIENT_SECRET in environment variables');
        }
    }


    async getClientCredentialsToken(scope = 'public') {
        try {
            const response = await axios.post(`${this.baseUrl}/token`, {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'client_credentials',
                scope: scope
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            const tokenData = response.data;
            this.accessToken = tokenData.access_token;
            this.expiresAt = Date.now() + (tokenData.expires_in * 1000);

            Logger.service('OsuAuth: Client credentials token successfully obtained');
            return tokenData;
        } catch (error) {
            const msg = `Error getting client credentials token: ${error.response?.data?.error || error.message}`;
            Logger.errorCatch('OsuAuth', msg);
            await notifier.send(msg, 'OSUAUTH.CLIENT_CREDENTIALS');
            throw new Error(msg);
        }
    }

    clearTokenData() {
        this.accessToken = null;
        this.expiresAt = null;
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
