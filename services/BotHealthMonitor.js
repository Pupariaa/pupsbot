const os = require('os');
const { monitorEventLoopDelay, PerformanceObserver, constants } = require('node:perf_hooks');
const MetricsCollector = require('./MetricsCollector');
const Logger = require('../utils/Logger');
const Notifier = require('./Notifier');
const generateId = require('../utils/generateId');

class BotHealthMonitor {
    constructor() {
        this.metricsCollector = new MetricsCollector();
        this.notifier = new Notifier();
        this.isMonitoring = false;
        this.monitoringInterval = null;

        this.loopDelay = monitorEventLoopDelay({ resolution: 10 });
        this.loopDelay.enable();

        this.gcTypes = {
            [constants.NODE_PERFORMANCE_GC_MAJOR]: 'major',
            [constants.NODE_PERFORMANCE_GC_MINOR]: 'minor',
            [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental',
            [constants.NODE_PERFORMANCE_GC_WEAKCB]: 'weakcb'
        };

        this.gcLog = [];
        this.setupGCObserver();
    }

    setupGCObserver() {
        const gcObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                this.gcLog.push({
                    type: this.gcTypes[entry.kind] || 'unknown',
                    duration: entry.duration
                });
            }
        });
        gcObserver.observe({ entryTypes: ['gc'] });
    }

    async init() {
        try {
            await this.metricsCollector.init();
            Logger.service('BotHealthMonitor initialized');
        } catch (error) {
            Logger.errorCatch('BotHealthMonitor.init', error);
            throw error;
        }
    }

    async close() {
        try {
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
                this.monitoringInterval = null;
            }
            await this.metricsCollector.close();
            Logger.service('BotHealthMonitor closed');
        } catch (error) {
            Logger.errorCatch('BotHealthMonitor.close', error);
        }
    }

    async getCPUUsagePercent(durationMs = 100) {
        const startUsage = process.cpuUsage();
        const startTime = process.hrtime();

        await new Promise(resolve => setTimeout(resolve, durationMs));

        const elapTime = process.hrtime(startTime);
        const elapUsage = process.cpuUsage(startUsage);

        const elapTimeMs = (elapTime[0] * 1000) + (elapTime[1] / 1e6);
        const elapUserMs = elapUsage.user / 1000;
        const elapSysMs = elapUsage.system / 1000;
        const totalCPUms = elapUserMs + elapSysMs;

        const cores = os.cpus().length;
        const cpuPercent = (totalCPUms / (elapTimeMs * cores)) * 100;

        return {
            userCPU: parseFloat(elapUserMs.toFixed(2)),
            systemCPU: parseFloat(elapSysMs.toFixed(2)),
            cpuPercent: parseFloat(cpuPercent.toFixed(2))
        };
    }

    async collectHealthMetrics() {
        const healthId = generateId();

        try {
            await this.metricsCollector.createCommandEntry(healthId, 'system_health');

            const mem = process.memoryUsage();
            const heapUsedMB = parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2));
            const rssMB = parseFloat((mem.rss / 1024 / 1024).toFixed(2));
            const externalMB = parseFloat((mem.external / 1024 / 1024).toFixed(2));

            const res = process.resourceUsage();
            const maxRSSMB = parseFloat((res.maxRSS / 1024).toFixed(2));

            const lagMean = parseFloat((this.loopDelay.mean / 1e6).toFixed(2));
            const lagMax = parseFloat((this.loopDelay.max / 1e6).toFixed(2));
            const lagStddev = parseFloat((this.loopDelay.stddev / 1e6).toFixed(2));

            const recentGCs = this.gcLog.splice(0, this.gcLog.length);
            const gcSummary = recentGCs.length
                ? recentGCs.map(gc => `${gc.type} (${gc.duration.toFixed(1)}ms)`).join(', ')
                : 'none';

            const cpuUsage = await this.getCPUUsagePercent();

            await this.metricsCollector.recordStepDuration(healthId, 'collect_memory');
            await this.metricsCollector.recordStepDuration(healthId, 'collect_cpu');
            await this.metricsCollector.recordStepDuration(healthId, 'collect_eventloop');

            await this.metricsCollector.updateCommandDurations(healthId, {
                'memory_heap_used': heapUsedMB,
                'memory_rss': rssMB,
                'memory_external': externalMB,
                'memory_max_rss': maxRSSMB,
                'eventloop_lag_mean': lagMean,
                'eventloop_lag_max': lagMax,
                'eventloop_lag_stddev': lagStddev,
                'cpu_user': cpuUsage.userCPU,
                'cpu_system': cpuUsage.systemCPU,
                'cpu_percent': cpuUsage.cpuPercent
            });

            await this.metricsCollector.updateCommandResult(healthId, 'gc_summary', gcSummary);
            await this.metricsCollector.finalizeCommand(healthId, 'success');

            await this.recordServicePerformance(heapUsedMB, rssMB, externalMB, maxRSSMB, lagMean, lagMax, lagStddev, cpuUsage, gcSummary);

        } catch (error) {
            await this.metricsCollector.finalizeCommand(healthId, 'error');
            Logger.errorCatch('BotHealthMonitor.collectHealthMetrics', error);
        }
    }

    async recordServicePerformance(heapUsedMB, rssMB, externalMB, maxRSSMB, lagMean, lagMax, lagStddev, cpuUsage, gcSummary) {
        try {
            await this.metricsCollector.recordServicePerformance('system', 'memory_heap_used', heapUsedMB);
            await this.metricsCollector.recordServicePerformance('system', 'memory_rss', rssMB);
            await this.metricsCollector.recordServicePerformance('system', 'memory_external', externalMB);
            await this.metricsCollector.recordServicePerformance('system', 'memory_max_rss', maxRSSMB);
            await this.metricsCollector.recordServicePerformance('system', 'eventloop_lag_mean', lagMean);
            await this.metricsCollector.recordServicePerformance('system', 'eventloop_lag_max', lagMax);
            await this.metricsCollector.recordServicePerformance('system', 'eventloop_lag_stddev', lagStddev);
            await this.metricsCollector.recordServicePerformance('system', 'cpu_user', cpuUsage.userCPU);
            await this.metricsCollector.recordServicePerformance('system', 'cpu_system', cpuUsage.systemCPU);
            await this.metricsCollector.recordServicePerformance('system', 'cpu_percent', cpuUsage.cpuPercent);
        } catch (error) {
            Logger.errorCatch('BotHealthMonitor.recordServicePerformance', error);
        }
    }

    startMonitoring(intervalMs = 1000) {
        if (this.isMonitoring) {
            Logger.service('BotHealthMonitor is already monitoring');
            return;
        }

        this.isMonitoring = true;
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.collectHealthMetrics();
            } catch (error) {
                Logger.errorCatch('BotHealthMonitor.monitoringInterval', error);
            }
        }, intervalMs);

        Logger.service(`BotHealthMonitor started (interval: ${intervalMs}ms)`);
    }

    stopMonitoring() {
        if (!this.isMonitoring) {
            Logger.service('BotHealthMonitor is not monitoring');
            return;
        }

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.isMonitoring = false;
        Logger.service('BotHealthMonitor stopped');
    }

    async getHealthStats(limit = 100) {
        try {
            await this.metricsCollector.init();
            const stats = await this.metricsCollector.getServicePerformanceStats('system', 'memory_heap_used', limit);
            return stats;
        } catch (error) {
            Logger.errorCatch('BotHealthMonitor.getHealthStats', error);
            throw error;
        } finally {
            await this.metricsCollector.close();
        }
    }

    async getAllHealthStats(limit = 100) {
        try {
            await this.metricsCollector.init();
            const allStats = await this.metricsCollector.getAllServiceStats(limit);
            return allStats.system || {};
        } catch (error) {
            Logger.errorCatch('BotHealthMonitor.getAllHealthStats', error);
            throw error;
        } finally {
            await this.metricsCollector.close();
        }
    }
}

module.exports = BotHealthMonitor;
