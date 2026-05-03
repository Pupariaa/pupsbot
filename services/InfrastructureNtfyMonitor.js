const axios = require('axios');
const Logger = require('../utils/Logger');

class InfrastructureNtfyMonitor {
    constructor({ performe, db, getPrimaryIrc, getSecondaryIrc, secondaryConfigured }) {
        this.performe = performe;
        this.db = db;
        this.getPrimaryIrc = getPrimaryIrc;
        this.getSecondaryIrc = getSecondaryIrc;
        this.secondaryConfigured = secondaryConfigured;
        this.intervalMs = parseInt(process.env.NTFY_INFRA_INTERVAL_MS || '45000', 10);
        this.last = {};
        this.startTimeout = null;
        this.intervalHandle = null;
        this.token = process.env.NTFY_TOKEN || '';
        this.http = axios.create({ timeout: 15000 });
        this.postUrl = null;
    }

    label(key) {
        const map = {
            redis: 'Redis',
            database: 'Database',
            irc_primary: 'IRC (primary)',
            irc_secondary: 'IRC (secondary)'
        };
        return map[key] || key;
    }

    async gatherProbes() {
        const out = {};

        try {
            await Promise.race([
                this.performe.ping(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 5000)
                )
            ]);
            out.redis = { ok: true };
        } catch (e) {
            out.redis = { ok: false, detail: e.message || String(e) };
        }

        try {
            await Promise.race([
                this.db.sequelize.authenticate(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 5000)
                )
            ]);
            out.database = { ok: true };
        } catch (e) {
            out.database = { ok: false, detail: e.message || String(e) };
        }

        const primary = this.getPrimaryIrc ? this.getPrimaryIrc() : null;
        const primaryOk = !!(primary && typeof primary.isConnected === 'function' && primary.isConnected());
        out.irc_primary = {
            ok: primaryOk,
            ...(!primaryOk && { detail: primary ? 'not connected' : 'not initialized' })
        };

        if (this.secondaryConfigured) {
            const secondary = this.getSecondaryIrc ? this.getSecondaryIrc() : null;
            const secondaryOk = !!(secondary && typeof secondary.isConnected === 'function' && secondary.isConnected());
            out.irc_secondary = {
                ok: secondaryOk,
                ...(!secondaryOk && { detail: secondary ? 'not connected' : 'not initialized' })
            };
        }

        return out;
    }

    async postNtfy(title, body, priority) {
        const headers = {
            Title: title,
            Priority: priority
        };
        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }
        await this.http.post(this.postUrl, body, { headers });
    }

    async notifyDown(key, detail) {
        const name = this.label(key);
        const text = detail ? `${name} is down: ${detail}` : `${name} is down`;
        await this.postNtfy(`Pupsbot: ${name} down`, text, 'urgent');
    }

    async notifyUp(key) {
        const name = this.label(key);
        await this.postNtfy(`Pupsbot: ${name} recovered`, `${name} is back up.`, 'default');
    }

    async tick() {
        const probes = await this.gatherProbes();
        for (const [key, result] of Object.entries(probes)) {
            const ok = result.ok;
            const detail = result.detail;
            const prev = this.last[key];

            if (prev === undefined) {
                this.last[key] = ok;
                if (!ok) {
                    try {
                        await this.notifyDown(key, detail);
                    } catch (e) {
                        Logger.errorCatch('InfrastructureNtfyMonitor.notifyDown', e);
                    }
                }
                continue;
            }

            if (prev === true && !ok) {
                try {
                    await this.notifyDown(key, detail);
                } catch (e) {
                    Logger.errorCatch('InfrastructureNtfyMonitor.notifyDown', e);
                }
            } else if (prev === false && ok) {
                try {
                    await this.notifyUp(key);
                } catch (e) {
                    Logger.errorCatch('InfrastructureNtfyMonitor.notifyUp', e);
                }
            }
            this.last[key] = ok;
        }
    }

    start() {
        if (process.env.NTFY_INFRA_ENABLED === 'false') {
            Logger.service('InfrastructureNtfyMonitor: disabled (NTFY_INFRA_ENABLED=false)');
            return;
        }
        const base = (process.env.NTFY_URL || '').replace(/\/$/, '');
        const topic = process.env.NTFY_INFRA_TOPIC || process.env.NTFY_TOPIC;
        if (!base || !topic) {
            Logger.service('InfrastructureNtfyMonitor: skipped (NTFY_URL or NTFY_TOPIC / NTFY_INFRA_TOPIC missing)');
            return;
        }
        this.postUrl = `${base}/${encodeURIComponent(topic)}`;
        const delay = parseInt(process.env.NTFY_INFRA_START_DELAY_MS || '60000', 10);
        this.startTimeout = setTimeout(() => {
            this.startTimeout = null;
            this.intervalHandle = setInterval(() => {
                this.tick().catch((e) => Logger.errorCatch('InfrastructureNtfyMonitor.tick', e));
            }, this.intervalMs);
            this.tick().catch((e) => Logger.errorCatch('InfrastructureNtfyMonitor.tick', e));
        }, delay);
    }

    stop() {
        if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
        }
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }
}

module.exports = InfrastructureNtfyMonitor;
