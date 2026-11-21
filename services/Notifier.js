require('dotenv').config();
const axios = require('axios');

const LEVELS = {
    panic: { priority: 'urgent', windowMs: 30000 },
    error: { priority: 'high', windowMs: 120000 },
    warn: { priority: 'default', windowMs: 180000 },
    info: { priority: 'low', windowMs: 60000 }
};

const RANK = { info: 1, warn: 2, error: 3, panic: 4 };

const PANIC_CONTEXTS = new Set([
    'IRC.FATAL',
    'REDIS.CONNECT',
    'DB.CONNECT',
    'PERFORME.INIT',
    'WORKER.OSU.FAIL2'
]);

const INFO_CONTEXTS = new Set([
    'IRC.REGISTERED',
    'IRC.RECONNECTED'
]);

const WARN_CONTEXTS = new Set([
    'IRC.DISCONNECTED',
    'IRC.ERROR',
    'IRC.SOCKET'
]);

const STICKY_CONTEXTS = new Set(['HEALTH', 'RATE', 'SCORESCAN', 'SCORESCAN.ERRORS', 'BOT.DEGRADED']);

const recent = new Map();

function topicName(baseTopic, level) {
    if (level === 'panic') return process.env.NTFY_TOPIC || baseTopic;
    const envName = `NTFY_TOPIC_${level.toUpperCase()}`;
    if (process.env[envName]) return process.env[envName];
    const base = String(baseTopic || 'pupsbot').replace(/-panic$/, '');
    return `${base}-${level}`;
}

function coreText(message) {
    return String(message)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(irc|connection|error|socket|failed|failure|the|to|on|a|an)\b/g, ' ')
        .replace(/\d{5,}/g, '#')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}

function allow(level, context, message) {
    const now = Date.now();
    const key = STICKY_CONTEXTS.has(context)
        ? `${context}`
        : `${coreText(message)}`;
    const hit = recent.get(key);
    const windowMs = LEVELS[level].windowMs;
    if (hit && now - hit.at < windowMs && RANK[level] <= hit.rank) {
        hit.count += 1;
        return null;
    }
    const repeated = hit && now - hit.at < windowMs ? hit.count : 0;
    recent.set(key, { at: now, count: 1, rank: RANK[level] });
    if (recent.size > 400) {
        for (const [storedKey, value] of recent) {
            if (now - value.at > 600000) recent.delete(storedKey);
        }
    }
    return repeated;
}

class Notifier {
    constructor() {
        this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
        this.ntfyUrl = process.env.NTFY_URL;
        this.ntfyTopic = process.env.NTFY_TOPIC;

        if (!this.discordWebhookUrl || !this.ntfyUrl || !this.ntfyTopic) {
            throw new Error('Notifier misconfigured: missing environment variables');
        }

        this.http = axios.create({
            timeout: 5000
        });
    }

    levelFor(context) {
        if (PANIC_CONTEXTS.has(context)) return 'panic';
        if (INFO_CONTEXTS.has(context)) return 'info';
        if (WARN_CONTEXTS.has(context)) return 'warn';
        return 'error';
    }

    async send(message, context = 'Alert') {
        await this.publish(this.levelFor(context), context, message);
    }

    async publish(level, context, message) {
        const safe = this.sanitize(message);
        let chosen = LEVELS[level] ? level : 'error';
        if (/status code 404|\bHTTP 404\b/.test(safe)) {
            chosen = 'info';
        } else if (/status code 500|\bHTTP 500\b|\bHTTP 5\d\d\b/.test(safe)) {
            chosen = 'error';
        }
        const repeated = allow(chosen, context, safe);
        if (repeated === null) return;
        const text = repeated > 1
            ? `[${context}] ${safe}\nrepeated ${repeated} times`
            : `[${context}] ${safe}`;
        const tasks = [this.sendNtfy(chosen, context, text)];
        if (chosen === 'panic' || chosen === 'error') {
            tasks.push(this.sendDiscord(text));
        }
        await Promise.allSettled(tasks);
    }

    sanitize(message) {
        return String(message)
            .replace(/password[=:]\s*\S+/gi, 'password=***')
            .replace(/token[=:]\s*\S+/gi, 'token=***')
            .replace(/secret[=:]\s*\S+/gi, 'secret=***')
            .replace(/authorization:\s*\S+/gi, 'authorization: ***')
            .replace(/bearer\s+\S+/gi, 'bearer ***')
            .slice(0, 3500);
    }

    async sendDiscord(message) {
        await this.http.post(this.discordWebhookUrl, {
            content: message.slice(0, 1800)
        });
    }

    async sendNtfy(level, context, message) {
        const topic = topicName(this.ntfyTopic, level);
        const url = `${this.ntfyUrl.replace(/\/$/, '')}/${encodeURIComponent(topic)}`;
        await this.http.post(url, message, {
            headers: {
                Title: `Pupsbot ${context}`,
                Priority: LEVELS[level].priority
            }
        });
    }
}

module.exports = Notifier;
