const axios = require('axios');
const crypto = require('crypto');

const INTERVAL = 10000;
const MAX_BATCH = 10;
const queue = [];
let timer = null;
let sending = false;
let lastSentAt = 0;
let nextId = 0;

function enabled() {
    return Boolean(process.env.OSU_RELAY_URL && process.env.OSU_RELAY_SECRET);
}

function enqueue(config) {
    return new Promise((resolve, reject) => {
        queue.push({ id: String(++nextId), config, resolve, reject });
        arm();
    });
}

function arm() {
    if (timer || sending || queue.length === 0) return;
    const wait = lastSentAt === 0 ? INTERVAL : Math.max(0, INTERVAL - (Date.now() - lastSentAt));
    timer = setTimeout(() => {
        timer = null;
        flush().catch((error) => {
            console.error(`[relay] flush failed ${error.message}`);
        });
    }, wait);
}

function relayLimited(result) {
    const status = Number(result.status) || 0;
    if (status !== 429) return false;
    let data = result.body;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (error) {
            return data.includes('relay limit');
        }
    }
    return Boolean(data && data.error === 'relay limit');
}

function deliver(item, result) {
    const status = Number(result.status) || 502;
    let data = result.body;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (error) {
            data = { error: data.slice(0, 300) };
        }
    }
    if (status >= 400) {
        const failure = new Error(`Request failed with status code ${status}`);
        failure.response = { status, data };
        item.reject(failure);
        return;
    }
    item.resolve({ data });
}

async function post(batch) {
    const requests = batch.map((item) => {
        const target = new URL(item.config.url);
        return {
            id: item.id,
            method: String(item.config.method || 'GET').toUpperCase(),
            path: `${target.pathname.slice('/api/v2'.length)}${target.search}`,
            body: item.config.data === undefined ? null : item.config.data,
            authorization: item.config.headers.Authorization || item.config.headers.authorization || ''
        };
    });
    const payload = JSON.stringify({ requests });
    const time = String(Math.floor(Date.now() / 1000));
    const sign = crypto.createHmac('sha256', process.env.OSU_RELAY_SECRET).update(`${time}\n${payload}`).digest('hex');
    const response = await axios({
        method: 'POST',
        url: process.env.OSU_RELAY_URL,
        data: payload,
        timeout: 90000,
        headers: {
            'Content-Type': 'application/json',
            'X-Panel-Time': time,
            'X-Panel-Sign': sign
        },
        validateStatus: () => true
    });
    const results = response.data && Array.isArray(response.data.results) ? response.data.results : null;
    if (response.status !== 200 || !results) {
        const failure = new Error(`Request failed with status code ${response.status}`);
        failure.response = { status: response.status, data: response.data };
        throw failure;
    }
    const byId = new Map();
    for (const result of results) byId.set(String(result.id), result);
    return byId;
}

async function flush() {
    if (sending || queue.length === 0) return;
    sending = true;
    const batch = queue.splice(0, MAX_BATCH);
    lastSentAt = Date.now();
    try {
        const results = await post(batch);
        console.log(`[relay] batch sent count=${batch.length}`);
        const again = [];
        for (const item of batch) {
            const result = results.get(item.id);
            if (!result) {
                const failure = new Error('Request failed with status code 502');
                failure.response = { status: 502, data: { error: 'relay missing' } };
                item.reject(failure);
                continue;
            }
            if (relayLimited(result)) {
                item.retries = (item.retries || 0) + 1;
                if (item.retries <= 6) {
                    again.push(item);
                    continue;
                }
            }
            deliver(item, result);
        }
        if (again.length > 0) queue.unshift(...again);
    } catch (error) {
        for (const item of batch) item.reject(error);
        throw error;
    } finally {
        sending = false;
        arm();
    }
}

module.exports = { enabled, enqueue };
