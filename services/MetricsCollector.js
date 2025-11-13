const { createClient } = require('redis');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const Logger = require('../utils/Logger');
const Notifier = require('./Notifier');
const notifier = new Notifier();

class MetricsCollector {
    constructor() {
        this._connected = false;
        this._connecting = false;
        this._redis = null;

        this.client = createClient({
            socket: {
                host: process.env.REDIS_METRICS_HOST || process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.METRICS_REDIS_PORT || process.env.REDIS_PORT || '6379', 10),
                reconnectStrategy: (retries) => Math.min(retries * 50, 2000)
            },
            password: process.env.REDIS_METRICS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
            database: parseInt(process.env.REDIS_METRICS_DB || process.env.REDIS_DB || '0', 10)
        });

        this._influxClient = null;
        this._influxWriteApi = null;
        this._influxOrg = process.env.INFLUX_ORG || '';
        this._influxBucket = process.env.INFLUX_BUCKET || 'metrics';
        const rawToken = process.env.INFLUX_TOKEN || '';
        this._influxToken = rawToken.trim().replace(/^["']|["']$/g, '');
        this._influxUrl = process.env.INFLUX_URL || '';

        if (rawToken && !this._influxToken) {
            Logger.service(`WARNING: INFLUX_TOKEN was set but is empty after processing. Raw length: ${rawToken.length}`);
        }

        this._influxEnabled = false;
        if (this._influxUrl && this._influxToken && this._influxOrg) {
            this._influxEnabled = true;
        } else {
            const missing = [];
            if (!this._influxUrl) missing.push('INFLUX_URL');
            if (!this._influxToken) missing.push('INFLUX_TOKEN');
            if (!this._influxOrg) missing.push('INFLUX_ORG');
            Logger.service(`InfluxDB: Disabled - missing: ${missing.join(', ')}`);
        }

        this._setupEventHandlers();
    }

    _setupEventHandlers() {
        this.client.on('connect', () => {
            this._connected = true;
            this._connecting = false;
        });

        this.client.on('error', async (error) => {
            Logger.redisErr('METRICS_REDIS.ERROR', error);
            await notifier.send(`MetricsCollector Redis error: ${error.message}`, 'METRICS_REDIS.ERROR');
        });

        this.client.on('end', () => {
            this._connected = false;
            this._connecting = false;
        });
    }

    async init() {
        if (this._connected) return;
        if (this._connecting) return;

        this._connecting = true;

        try {
            await this.client.connect();
            this._redis = this.client;
        } catch (error) {
            this._connecting = false;
            Logger.errorCatch('METRICS_COLLECTOR.INIT', error);
            await notifier.send(`MetricsCollector Redis init error: ${error.message}`, 'METRICS_REDIS.INIT');
            throw error;
        }

        if (this._influxEnabled) {
            try {
                const tokenLength = this._influxToken ? this._influxToken.length : 0;
                const tokenEndsWithEquals = this._influxToken ? this._influxToken.endsWith('==') : false;
                Logger.service(`InfluxDB: Initializing with URL=${this._influxUrl}, Org=${this._influxOrg}, Bucket=${this._influxBucket}, TokenLength=${tokenLength}, EndsWith===${tokenEndsWithEquals}`);

                if (!this._influxToken || this._influxToken.length < 10) {
                    Logger.errorCatch('METRICS_COLLECTOR.INFLUX_INIT', new Error(`Token seems invalid or too short. Length: ${tokenLength}`));
                    this._influxEnabled = false;
                    return;
                }

                this._influxClient = new InfluxDB({ url: this._influxUrl, token: this._influxToken });
                this._influxWriteApi = this._influxClient.getWriteApi(this._influxOrg, this._influxBucket, 'ms');
                this._influxWriteApi.useDefaultTags({ source: 'pupsbot' });

                Logger.service('InfluxDB: Successfully initialized');
            } catch (error) {
                Logger.errorCatch('METRICS_COLLECTOR.INFLUX_INIT', error);
                this._influxEnabled = false;
            }
        }
    }

    async createCommandEntry(commandId, commandName, userId = null, additionalData = {}) {
        try {
            await this._ensureReady();
            const timestamp = Date.now();

            const metricsData = {
                commandId: commandId.toString(),
                commandName: commandName.toString(),
                status: 'pending',
                result: 'pending',
                userId: userId?.toString() || '',
                timestamp: timestamp.toString(),
                startTime: timestamp.toString(),
                endTime: '',
                totalDuration: '0'
            };

            for (const [key, value] of Object.entries(additionalData)) {
                metricsData[key] = (value !== null && value !== undefined) ? value.toString() : '';
            }

            const key = `metrics:command:${commandId}`;
            await this._redis.hSet(key, metricsData);
            await this._redis.expire(key, 86400 * 7);

            await this._redis.zAdd('metrics:commands:timeline', {
                score: timestamp,
                value: commandId.toString()
            });

            await this._redis.zAdd(`metrics:commands:${commandName}`, {
                score: timestamp,
                value: commandId.toString()
            });

            this._writeToInflux('command_created', {
                commandId: commandId.toString(),
                commandName: commandName.toString(),
                userId: userId?.toString() || '',
                status: 'pending',
                timestamp: timestamp
            }, additionalData);

            return timestamp;
        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.CREATE_ENTRY', error);
            throw error;
        }
    }

    async updateCommandDurations(commandId, durations) {
        try {
            await this._ensureReady();

            const key = `metrics:command:${commandId}`;

            const existingData = await this._redis.hGetAll(key);
            if (!existingData.startTime) {
                throw new Error(`No startTime found for command ${commandId}. Make sure createCommandEntry was called first.`);
            }

            const startTime = parseInt(existingData.startTime);
            const currentTime = Date.now();

            const updateData = {};
            let lastTimestamp = startTime;

            for (const [stepName, stepDuration] of Object.entries(durations)) {
                let durationValue;

                if (typeof stepDuration === 'number') {
                    durationValue = stepDuration;
                } else if (typeof stepDuration === 'string' && stepDuration.includes(':')) {
                    const stepTime = new Date(stepDuration).getTime();
                    durationValue = stepTime - lastTimestamp;
                    lastTimestamp = stepTime;
                } else {
                    durationValue = 0;
                }

                updateData[`duration_${stepName}`] = durationValue.toString();
                updateData[`timestamp_${stepName}`] = lastTimestamp.toString();
            }

            let totalDuration = 0;
            for (const [key, value] of Object.entries({ ...existingData, ...updateData })) {
                if (key.startsWith('duration_')) {
                    const duration = parseFloat(value) || 0;
                    totalDuration += duration;
                }
            }
            updateData.totalDuration = totalDuration.toString();

            await this._redis.hSet(key, updateData);

            this._writeToInflux('command_durations_updated', {
                commandId: commandId.toString(),
                totalDuration: totalDuration
            }, durations);

        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.UPDATE_DURATIONS', error);
            throw error;
        }
    }

    async finalizeCommand(commandId, status, finalDurations = null) {
        try {
            await this._ensureReady();

            const key = `metrics:command:${commandId}`;
            const endTime = Date.now();

            const updateData = {
                status: status.toString(),
                endTime: endTime.toString()
            };

            if (finalDurations) {
                for (const [stepName, stepDuration] of Object.entries(finalDurations)) {
                    const durationValue = stepDuration || 0;
                    updateData[`duration_${stepName}`] = durationValue.toString();
                }
                updateData.totalDuration = Object.values(finalDurations).reduce((sum, duration) => sum + (duration || 0), 0).toString();
            } else {
                const existingData = await this._redis.hGetAll(key);

                let total = 0;
                for (const [key, value] of Object.entries(existingData)) {
                    if (key.startsWith('duration_')) {
                        const duration = parseFloat(value) || 0;
                        total += duration;
                    }
                }
                updateData.totalDuration = total.toString();
            }

            await this._redis.hSet(key, updateData);

            this._writeToInflux('command_finalized', {
                commandId: commandId.toString(),
                status: status.toString(),
                endTime: endTime,
                totalDuration: parseFloat(updateData.totalDuration) || 0
            });

        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.FINALIZE', error);
            throw error;
        }
    }

    async getCommandMetrics(commandId) {
        try {
            await this._ensureReady();

            const key = `metrics:command:${commandId}`;
            const data = await this._redis.hGetAll(key);

            if (!data || Object.keys(data).length === 0) {
                return null;
            }

            const result = {
                commandId: data.commandId,
                commandName: data.commandName,
                status: data.status,
                result: data.result,
                userId: data.userId || null,
                timestamp: parseInt(data.timestamp),
                startTime: parseInt(data.startTime),
                endTime: data.endTime && data.endTime !== '' ? parseInt(data.endTime) : null,
                totalDuration: parseFloat(data.totalDuration) || 0
            };

            const durations = {};
            for (const [key, value] of Object.entries(data)) {
                if (key.startsWith('duration_')) {
                    const stepName = key.replace('duration_', '');
                    durations[stepName] = parseFloat(value) || 0;
                }
            }
            result.durations = durations;

            return result;
        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.GET_METRICS', error);
            throw error;
        }
    }

    async getCommandStats(commandName, limit = 100) {
        try {
            await this._ensureReady();

            const commandIds = await this._redis.zRevRange(`metrics:commands:${commandName}`, 0, limit - 1);
            const stats = {
                totalCommands: commandIds.length,
                averageDuration: 0,
                successRate: 0,
                stepStats: {}
            };

            if (commandIds.length === 0) {
                return stats;
            }

            let totalDuration = 0;
            let successCount = 0;
            const stepDurations = {};

            for (const commandId of commandIds) {
                const metrics = await this.getCommandMetrics(commandId);
                if (metrics) {
                    totalDuration += metrics.totalDuration;
                    if (metrics.status === 'completed') {
                        successCount++;
                    }

                    for (const [stepName, duration] of Object.entries(metrics.durations)) {
                        if (!stepDurations[stepName]) {
                            stepDurations[stepName] = [];
                        }
                        stepDurations[stepName].push(duration);
                    }
                }
            }

            stats.averageDuration = totalDuration / commandIds.length;
            stats.successRate = (successCount / commandIds.length) * 100;

            for (const [stepName, durations] of Object.entries(stepDurations)) {
                const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
                stats.stepStats[stepName] = {
                    average: avg,
                    count: durations.length,
                    min: Math.min(...durations),
                    max: Math.max(...durations)
                };
            }

            return stats;
        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.GET_STATS', error);
            throw error;
        }
    }

    async getRecentCommands(limit = 50) {
        try {
            await this._ensureReady();

            const commandIds = await this._redis.zRevRange('metrics:commands:timeline', 0, limit - 1);
            const commands = [];

            for (const commandId of commandIds) {
                const metrics = await this.getCommandMetrics(commandId);
                if (metrics) {
                    commands.push(metrics);
                }
            }

            return commands;
        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.GET_RECENT', error);
            throw error;
        }
    }

    async cleanupOldMetrics(daysToKeep = 7) {
        try {
            await this._ensureReady();

            const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
            const oldCommandIds = await this._redis.zRangeByScore('metrics:commands:timeline', 0, cutoffTime);

            let deletedCount = 0;
            for (const commandId of oldCommandIds) {
                const key = `metrics:command:${commandId}`;
                await this._redis.del(key);
                deletedCount++;
            }

            await this._redis.zRemRangeByScore('metrics:commands:timeline', 0, cutoffTime);

            return deletedCount;
        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.CLEANUP', error);
            throw error;
        }
    }

    startTimer() {
        return process.hrtime.bigint();
    }

    createMultiStepTimer(commandId, commandName, userId = null, additionalData = {}) {
        const steps = {};
        const startTime = this.startTimer();

        return {
            startStep: (stepName) => {
                steps[stepName] = this.startTimer();
            },
            endStep: (stepName) => {
                if (steps[stepName]) {
                    const duration = Number(process.hrtime.bigint() - steps[stepName]) / 1e6;
                    return duration;
                }
                return 0;
            },
            getStepDuration: (stepName) => {
                if (steps[stepName]) {
                    return Number(process.hrtime.bigint() - steps[stepName]) / 1e6;
                }
                return 0;
            },
            finish: async (status = 'completed') => {
                const durations = {};
                for (const [stepName, stepStart] of Object.entries(steps)) {
                    durations[stepName] = Number(process.hrtime.bigint() - stepStart) / 1e6;
                }

                await this.createCommandEntry(commandId, commandName, userId, additionalData);
                await this.updateCommandDurations(commandId, durations);
                await this.finalizeCommand(commandId, status);
                return durations;
            }
        };
    }

    async recordStepDuration(commandId, stepName) {
        try {
            await this._ensureReady();

            const key = `metrics:command:${commandId}`;
            const currentTime = Date.now();

            const existingData = await this._redis.hGetAll(key);
            if (!existingData.startTime) {
                throw new Error(`No startTime found for command ${commandId}. Make sure createCommandEntry was called first.`);
            }

            const startTime = parseInt(existingData.startTime);
            let lastTimestamp = startTime;

            for (const [key, value] of Object.entries(existingData)) {
                if (key.startsWith('timestamp_')) {
                    const timestamp = parseInt(value);
                    if (timestamp > lastTimestamp) {
                        lastTimestamp = timestamp;
                    }
                }
            }

            const duration = currentTime - lastTimestamp;

            await this._redis.hSet(key, {
                [`duration_${stepName}`]: duration.toString(),
                [`timestamp_${stepName}`]: currentTime.toString()
            });

            this._writeToInflux('step_duration_recorded', {
                commandId: commandId.toString(),
                stepName: stepName,
                duration: duration
            });

            const allData = await this._redis.hGetAll(key);
            let totalDuration = 0;
            for (const [key, value] of Object.entries(allData)) {
                if (key.startsWith('duration_')) {
                    totalDuration += parseFloat(value) || 0;
                }
            }
            await this._redis.hSet(key, 'totalDuration', totalDuration.toString());

        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.RECORD_STEP', error);
            throw error;
        }
    }

    async updateCommandResult(commandId, result) {
        try {
            await this._ensureReady();

            const key = `metrics:command:${commandId}`;

            await this._redis.hSet(key, 'result', result.toString());

            this._writeToInflux('command_result_updated', {
                commandId: commandId.toString(),
                result: result.toString()
            });

        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.UPDATE_RESULT', error);
            throw error;
        }
    }

    createStepTimestamp() {
        return new Date().toISOString();
    }

    calculateDurationFromTimestamp(timestamp) {
        const stepTime = new Date(timestamp).getTime();
        const currentTime = Date.now();
        return currentTime - stepTime;
    }

    startDatabaseTimer(commandId, operation) {
        const timerKey = `db_${commandId}_${operation}`;
        this._timers = this._timers || {};
        this._timers[timerKey] = Date.now();
        return timerKey;
    }

    async stopDatabaseTimer(commandId, operation) {
        try {
            await this._ensureReady();
            const timerKey = `db_${commandId}_${operation}`;
            const key = `metrics:command:${commandId}`;
            const currentTime = Date.now();

            if (!this._timers || !this._timers[timerKey]) {
                return;
            }

            const startTime = this._timers[timerKey];
            const duration = currentTime - startTime;

            delete this._timers[timerKey];

            const existingData = await this._redis.hGetAll(key);
            if (!existingData.startTime) {
                return;
            }

            await this._redis.hSet(key, {
                [`db_${operation}`]: duration.toString(),
                [`timestamp_db_${operation}`]: currentTime.toString()
            });

            this._writeToInflux('database_timer', {
                commandId: commandId.toString(),
                operation: operation,
                duration: duration
            });

            const allData = await this._redis.hGetAll(key);
            let totalDuration = 0;
            for (const [key, value] of Object.entries(allData)) {
                if (key.startsWith('duration_') || key.startsWith('db_') || key.startsWith('redis_') || key.startsWith('api_')) {
                    totalDuration += parseFloat(value) || 0;
                }
            }
            await this._redis.hSet(key, 'totalDuration', totalDuration.toString());

        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.DB_TIMER', error);
        }
    }

    startRedisTimer(commandId, operation) {
        const timerKey = `redis_${commandId}_${operation}`;
        this._timers = this._timers || {};
        this._timers[timerKey] = Date.now();
        return timerKey;
    }

    async stopRedisTimer(commandId, operation) {
        try {
            await this._ensureReady();
            const timerKey = `redis_${commandId}_${operation}`;
            const key = `metrics:command:${commandId}`;
            const currentTime = Date.now();

            if (!this._timers || !this._timers[timerKey]) {
                return;
            }

            const startTime = this._timers[timerKey];
            const duration = currentTime - startTime;

            delete this._timers[timerKey];

            const existingData = await this._redis.hGetAll(key);
            if (!existingData.startTime) {
                return;
            }

            await this._redis.hSet(key, {
                [`redis_${operation}`]: duration.toString(),
                [`timestamp_redis_${operation}`]: currentTime.toString()
            });

            this._writeToInflux('redis_timer', {
                commandId: commandId.toString(),
                operation: operation,
                duration: duration
            });

            const allData = await this._redis.hGetAll(key);
            let totalDuration = 0;
            for (const [key, value] of Object.entries(allData)) {
                if (key.startsWith('duration_') || key.startsWith('db_') || key.startsWith('redis_') || key.startsWith('api_')) {
                    totalDuration += parseFloat(value) || 0;
                }
            }
            await this._redis.hSet(key, 'totalDuration', totalDuration.toString());

        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.REDIS_TIMER', error);
        }
    }

    startApiTimer(commandId, operation, version = 'v1') {
        const timerKey = `api_${version}_${commandId}_${operation}`;
        this._timers = this._timers || {};
        this._timers[timerKey] = Date.now();
        return timerKey;
    }

    async stopApiTimer(commandId, operation, version = 'v1') {
        try {
            await this._ensureReady();
            const timerKey = `api_${version}_${commandId}_${operation}`;
            const key = `metrics:command:${commandId}`;
            const currentTime = Date.now();

            if (!this._timers || !this._timers[timerKey]) {
                return;
            }

            const startTime = this._timers[timerKey];
            const duration = currentTime - startTime;

            delete this._timers[timerKey];

            const existingData = await this._redis.hGetAll(key);
            if (!existingData.startTime) {
                return;
            }

            await this._redis.hSet(key, {
                [`api_${version}_${operation}`]: duration.toString(),
                [`timestamp_api_${version}_${operation}`]: currentTime.toString()
            });

            this._writeToInflux('api_timer', {
                commandId: commandId.toString(),
                operation: operation,
                version: version,
                duration: duration
            });

            const allData = await this._redis.hGetAll(key);
            let totalDuration = 0;
            for (const [key, value] of Object.entries(allData)) {
                if (key.startsWith('duration_') || key.startsWith('db_') || key.startsWith('redis_') || key.startsWith('api_')) {
                    totalDuration += parseFloat(value) || 0;
                }
            }
            await this._redis.hSet(key, 'totalDuration', totalDuration.toString());

        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.API_TIMER', error);
        }
    }

    async recordServicePerformance(serviceType, operation, duration, version = null) {
        try {
            await this._ensureReady();
            const operationKey = version ? `${operation}_${version}` : operation;
            const key = `service_perf:${serviceType}:${operationKey}`;
            const timestamp = Date.now();

            // Use async operation to avoid blocking
            this._redis.zAdd(key, { score: timestamp, value: duration.toString() }).catch(error => {
                Logger.errorCatch('MetricsCollector', `Failed to record service performance: ${error.message}`);
            });
            this._redis.expire(key, 86400 * 7).catch(error => {
                Logger.errorCatch('MetricsCollector', `Failed to set expiry for service performance: ${error.message}`);
            });

            this._writeToInflux('service_performance', {
                serviceType: serviceType,
                operation: operationKey,
                duration: duration,
                version: version || ''
            });

        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.SERVICE_PERF', error);
        }
    }

    async getServicePerformanceStats(serviceType, operation, limit = 1000, version = null) {
        try {
            await this._ensureReady();
            const operationKey = version ? `${operation}_${version}` : operation;
            const key = `service_perf:${serviceType}:${operationKey}`;

            const durations = await this._redis.zRange(key, 0, limit - 1, { REV: true });

            if (durations.length === 0) {
                return {
                    operation: operationKey,
                    count: 0,
                    average: 0,
                    min: 0,
                    max: 0,
                    p50: 0,
                    p95: 0,
                    p99: 0
                };
            }

            const numericDurations = durations.map(d => parseFloat(d)).sort((a, b) => a - b);
            const count = numericDurations.length;
            const sum = numericDurations.reduce((a, b) => a + b, 0);
            const average = sum / count;
            const min = numericDurations[0];
            const max = numericDurations[count - 1];
            const p50 = numericDurations[Math.floor(count * 0.5)];
            const p95 = numericDurations[Math.floor(count * 0.95)];
            const p99 = numericDurations[Math.floor(count * 0.99)];

            return {
                operation: operationKey,
                count: count,
                average: Math.round(average),
                min: min,
                max: max,
                p50: p50,
                p95: p95,
                p99: p99
            };

        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.GET_SERVICE_PERF', error);
            throw error;
        }
    }

    async getAllServiceStats(limit = 1000) {
        try {
            await this._ensureReady();

            const dbKeys = await this._redis.keys('service_perf:db:*');
            const redisKeys = await this._redis.keys('service_perf:redis:*');
            const apiKeys = await this._redis.keys('service_perf:api:*');
            const systemKeys = await this._redis.keys('service_perf:system:*');

            const stats = {
                database: {},
                redis: {},
                api: {},
                system: {}
            };

            for (const key of dbKeys) {
                const operation = key.replace('service_perf:db:', '');
                stats.database[operation] = await this.getServicePerformanceStats('db', operation, limit);
            }

            for (const key of redisKeys) {
                const operation = key.replace('service_perf:redis:', '');
                stats.redis[operation] = await this.getServicePerformanceStats('redis', operation, limit);
            }

            for (const key of apiKeys) {
                const operation = key.replace('service_perf:api:', '');
                stats.api[operation] = await this.getServicePerformanceStats('api', operation, limit);
            }

            for (const key of systemKeys) {
                const operation = key.replace('service_perf:system:', '');
                stats.system[operation] = await this.getServicePerformanceStats('system', operation, limit);
            }

            return stats;

        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.GET_ALL_SERVICE_STATS', error);
            throw error;
        }
    }

    async _ensureReady() {
        if (!this._connected) {
            await this.init();
        }
    }

    isConnected() {
        return this._connected;
    }

    async close() {
        if (!this._connected) return;
        try {
            await this.client.quit();
            this._connected = false;
        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.CLOSE', error);
        }

        if (this._influxWriteApi) {
            try {
                await this._influxWriteApi.close();
            } catch (error) {
                Logger.errorCatch('METRICS_COLLECTOR.INFLUX_CLOSE', error);
            }
        }
    }

    _writeToInflux(measurement, fields, tags = {}) {
        if (!this._influxEnabled || !this._influxWriteApi) {
            return;
        }

        try {
            const point = new Point(measurement);

            for (const [key, value] of Object.entries(fields)) {
                if (typeof value === 'number') {
                    point.floatField(key, value);
                } else if (typeof value === 'boolean') {
                    point.booleanField(key, value);
                } else {
                    point.stringField(key, value.toString());
                }
            }

            for (const [key, value] of Object.entries(tags)) {
                if (value !== null && value !== undefined) {
                    point.tag(key, value.toString());
                }
            }

            this._influxWriteApi.writePoint(point);
        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.INFLUX_WRITE', error);
        }
    }

    async flushInflux() {
        if (this._influxWriteApi) {
            try {
                await this._influxWriteApi.flush();
            } catch (error) {
                Logger.errorCatch('METRICS_COLLECTOR.INFLUX_FLUSH', error);
            }
        }
    }

    writeCommandLog(commandId, input, response, userId, username, success, durationMs, locale) {
        this._writeToInflux('command_log', {
            commandId: commandId.toString(),
            input: input.toString(),
            response: response.toString(),
            userId: userId?.toString() || '',
            username: username?.toString() || '',
            success: success ? 1 : 0,
            durationMs: durationMs || 0,
            locale: locale?.toString() || ''
        });
    }

    /**
     * Store data directly in Redis (for dynamic data like workers)
     * @param {string} key - Redis key
     * @param {string} data - Data to store (JSON string)
     */
    async setRedisData(key, data) {
        try {
            if (!this._connected) {
                await this.init();
            }
            await this.client.set(key, data);
        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.SET_REDIS_DATA', error);
            throw error;
        }
    }

    /**
     * Get data directly from Redis (for dynamic data like workers)
     * @param {string} key - Redis key
     * @returns {string|null} Data from Redis
     */
    async getRedisData(key) {
        try {
            if (!this._connected) {
                await this.init();
            }
            return await this.client.get(key);
        } catch (error) {
            Logger.errorCatch('METRICS_COLLECTOR.GET_REDIS_DATA', error);
            return null;
        }
    }
}

module.exports = MetricsCollector;