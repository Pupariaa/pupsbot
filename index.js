process.env.TZ = 'UTC+2';

const OsuIRCClient = require("./services/IRC");
const IRCQueueManager = require("./services/Queue");
const CommandManager = require('./services/Commands');
const RedisStore = require('./services/RedisStore');
const calculatePPWithMods = require('./utils/osu/PPCalculator');
const Logger = require('./utils/Logger');
const generateId = require('./utils/generateId');
const SQL = require('./services/SQL');
const MetricsCollector = require('./services/MetricsCollector');
const Notifier = require('./services/Notifier');
const BotHealthMonitor = require('./services/BotHealthMonitor');
const WorkerMonitor = require('./services/WorkerMonitor');
const OsuApiInternalServer = require('./services/OsuApis/InternalServer');
const OsuApiClient = require('./services/OsuApis/Client');
const UserRateLimiter = require('./services/UserRateLimiter');
const notifier = new Notifier();
const OsuUtils = require('osu-utils');
const osuUtils = new OsuUtils();
const TokenKeyInline = require('./services/GeneratePupswebLink');

let healthMonitor, performe, metricsCollector, workerMonitor, osuApiInternalServer, userRateLimiter;
global.temp = [];
global.activeWorkers = [];
global.userRequest = [];

(async () => {

    performe = new RedisStore();
    metricsCollector = new MetricsCollector();
    const db = new SQL();
    healthMonitor = new BotHealthMonitor();
    workerMonitor = new WorkerMonitor();
    osuApiInternalServer = new OsuApiInternalServer(25586);
    userRateLimiter = new UserRateLimiter(2, 30000); // 2 req/sec, 30s block

    await performe.init();
    await metricsCollector.init();
    await healthMonitor.init();

    workerMonitor.startMonitoring();
    await osuApiInternalServer.start();

    global.workerMonitor = workerMonitor;
    global.botHealthMonitor = healthMonitor;
    global.osuApiClient = new OsuApiClient('http://localhost:25586');
    global.performe = performe;
    global.db = db;

    Logger.service('OsuApi internal server started and client available globally');

    // Service health check function
    async function checkServiceHealth() {
        const health = {
            healthy: true,
            message: '',
            details: ''
        };

        Logger.service('Starting service health check...');

        // Check Redis connection with timeout and error isolation
        try {
            // Create a new Redis connection for testing to avoid interference
            const testRedis = new RedisStore();
            await testRedis.init();

            const redisPromise = testRedis.getTop100('test');
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Redis timeout')), 2000)
            );

            await Promise.race([redisPromise, timeoutPromise]);
            await testRedis.close();
            Logger.service('Redis health check: OK');
        } catch (error) {
            Logger.service(`Redis health check failed: ${error.code || error.message}`);

            // Handle all types of connection errors
            if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' ||
                error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' ||
                error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH' ||
                error.message.includes('ECONNRESET') || error.message.includes('ECONNREFUSED') ||
                error.message.includes('timeout') || error.message.includes('Redis timeout')) {
                health.healthy = false;
                health.details = `Redis connection error: ${error.code || error.message}`;
                health.message = 'Service temporarily unavailable (Redis). Please try again in a few moments.';
                Logger.service(`Service health check result: ${health.details}`);
                return health;
            }
            // For other Redis errors, continue to check DB
            Logger.errorCatch('Redis health check warning', error);
        }

        // Check Database connection with timeout and error isolation
        try {
            // Create a new DB connection for testing to avoid interference
            const testDb = new SQL();
            await testDb.connect();

            const dbPromise = testDb.getSuggestions(0);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Database timeout')), 2000)
            );

            await Promise.race([dbPromise, timeoutPromise]);
            await testDb.disconnect();
            Logger.service('Database health check: OK');
        } catch (error) {
            Logger.service(`Database health check failed: ${error.code || error.message}`);

            // Handle all types of connection errors
            if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' ||
                error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' ||
                error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH' ||
                error.message.includes('ECONNRESET') || error.message.includes('ECONNREFUSED') ||
                error.message.includes('timeout') || error.message.includes('Database timeout')) {
                health.healthy = false;
                health.details = `Database connection error: ${error.code || error.message}`;
                health.message = 'Service temporarily unavailable (Database). Please try again in a few moments.';
                Logger.service(`Service health check result: ${health.details}`);
                return health;
            }
            // For other DB errors, continue
            Logger.errorCatch('Database health check warning', error);
        }

        Logger.service('Service health check: All services OK');
        return health;
    }

    const trackers = new Map(); // Use Map for O(1) access instead of array

    async function refreshTrackers(performe) {
        const entries = await performe.getAllTrackedSuggestions();
        const now = Date.now();

        for (const { id, uid, bmid, length } of entries) {
            const key = `track:${id}`;
            if (trackers.has(key)) continue;

            Logger.trackSuccess(`Tracking: ${id} for user ${uid} on beatmap ${bmid} wait ${length}s (multiple intervals)`);

            // Define check intervals in seconds
            const checkIntervals = [15, 30, 60, 90, 120, 240, 600]; // 15s, 30s, 1min, 1min30s, 2min, 4min, 10min

            const action = async () => {
                const tracker = trackers.get(key);
                if (!tracker) return;

                const suggestionStart = tracker.start ?? now;
                const currentIntervalIndex = tracker.intervalIndex ?? 0;
                let played = null;

                try {
                    played = await global.osuApiClient.getUserBeatmapScore(bmid, uid);
                    played = played?.score;
                } catch (error) {
                    Logger.errorCatch('Tracker', `Failed to get user beatmap score for ${uid} on beatmap ${bmid}: ${error.message}`, error);
                    played = null;
                }

                if (played && played.created_at) {
                    const parsedDate = new Date(played.created_at);
                    if (isNaN(parsedDate.getTime())) {
                        if (index !== -1) trackers.splice(index, 1);
                        return;
                    }

                    const scoreDate = parsedDate.getTime();
                    const windowStart = suggestionStart - 20 * 60 * 1000;
                    const windowEnd = suggestionStart + (length + 600) * 1000; // Extended window

                    if (scoreDate >= windowStart && scoreDate <= windowEnd) {
                        // const beatmap = await global.osuApiClient.getBeatmap(bmid);
                        // const token = TokenKeyInline.generateToken(uid, played.beatmap);
                        await db.updateSuggestion(id, played.pp || 0, played.id, osuUtils.ModsStringToInt(played.mods.join('')));
                        Logger.trackSuccess(`✅ Score realised → Saved PP:${played.pp || 0} for ID:${id}`);

                        // Remove tracker since we found the score
                        trackers.delete(key);
                        // let title = '';
                        // if (beatmap) {
                        //     if (beatmap.title) {
                        //         title = beatmap.title;
                        //     } else {
                        //         title = beatmap.beatmapset.title;
                        //     }
                        // } else {
                        //     return
                        // }
                        // if (!played?.mods || played.mods.length === 0) {
                        //     queue.addToQueue(played.user.username, `Waaa ! ${parseFloat(played.pp).toFixed(0)} PP on [${played.beatmap.url} ${title} - (${played.beatmap.version})] ! Thank you for your play! Don't hesitate to rate the map! Objectively (and consider it as no mods). This will train the AI and you can win an Osu!Supporter [https://pb.pupsweb.cc/help?ref=${token} -> Here]`, false, generateId(), true);
                        // }

                        return;
                    }
                }

                // If no score found and we have more intervals to check
                if (currentIntervalIndex < checkIntervals.length - 1) {
                    const nextIntervalIndex = currentIntervalIndex + 1;
                    const nextInterval = checkIntervals[nextIntervalIndex];

                    trackers.set(key, {
                        key,
                        uid,
                        bmid,
                        duration: (length + nextInterval) * 1000,
                        start: now,
                        retries: 0,
                        intervalIndex: nextIntervalIndex,
                        action
                    });
                } else {
                    // No more intervals to check, remove tracker
                    trackers.delete(key);
                }
            };

            // Start with the first interval
            const firstInterval = checkIntervals[0];
            trackers.set(key, {
                key,
                uid,
                bmid,
                duration: (length + firstInterval) * 1000,
                start: now,
                retries: 0,
                intervalIndex: 0,
                action
            });
        }
    }
    async function runTrackers() {
        const now = Date.now();
        for (const [key, tracker] of trackers) {
            const elapsed = now - tracker.start;
            if (elapsed >= tracker.duration) {
                await tracker.action();
            }
        }
    }

    setInterval(async () => {
        await refreshTrackers(performe);
        await runTrackers();
    }, 1000);

    // Cleanup rate limiter every hour
    setInterval(() => {
        userRateLimiter.cleanup();
    }, 60 * 60 * 1000);

    const lastRequests = {};
    let ircBot, queue, commandManager;

    try {
        ircBot = new OsuIRCClient({
            username: process.env.IRC_USERNAME,
            password: process.env.IRC_PASSWORD,
            channel: "#osu",
        }, notifier);

        queue = new IRCQueueManager(
            (target, message) => ircBot.sendMessage(message, target),
            {
                maxConcurrent: 4,
                ratePerSecond: 4,
                maxRetries: 2,
                enableLogs: true
            }
        );

        commandManager = new CommandManager();
        ircBot.connect();

        healthMonitor.startMonitoring(1000);

    } catch (err) {
        Logger.errorCatch('Startup', err);
    }


    ircBot?.onAction(async ({ target, message, nick }) => {
        try {
            if (target !== process.env.IRC_USERNAME) return;

            // Check user rate limit FIRST, before any processing
            const rateLimitResult = userRateLimiter.checkRateLimit(nick);
            if (!rateLimitResult.allowed) {
                const message = userRateLimiter.getBlockMessage(rateLimitResult);
                await queue.addToQueue(nick, message, true, generateId(), true);
                userRateLimiter.logRateLimit(nick, rateLimitResult);
                return;
            }

            const beatmapId = (message.match(/\/b\/(\d+)/) || message.match(/beatmapsets\/\d+#\/(\d+)/) || [])[1];
            if (!beatmapId) return;
            const id = generateId()
            await metricsCollector.createCommandEntry(id, 'np');
            Logger.task(`Create: /np → ${id}`);

            const user = await global.osuApiClient.getUser(nick);
            await metricsCollector.recordStepDuration(id, 'get_user');
            const isFR = user.locale === 'FR';
            const result = await calculatePPWithMods(beatmapId);
            await metricsCollector.recordStepDuration(id, 'calculate_pp');

            if (result.error) {
                await queue.addToQueue(nick, result.error, false, id, false);
                await metricsCollector.finalizeCommand(id, 'error');
                return;
            }

            const summary = result.NoMod;

            lastRequests[nick] = {
                beatmapId,
                timestamp: Date.now(),
                results: result
            };

            const out = `${isFR ? 'PP (FC/NM) pour' : 'PP (FC/NM) for'} (100 %, 98 %, 95 %, 90 %) : ${summary['100']} / ${summary['98']} / ${summary['95']} / ${summary['90']} | ${isFR ? '!mods pour plus de d\u00e9tails' : '!mods for more details'}`;
            performe.logCommand(user.id, 'NP');

            await queue.addToQueue(nick, out, false, id, true);
        } catch (err) {
            await queue.addToQueue(nick, 'An error occurred while executing the /np command.', false, id, false);
            Logger.errorCatch('onAction', err);
        }
    });

    ircBot?.onMessage(async (event) => {
        try {
            if (event.target.toLowerCase() === process.env.IRC_USERNAME.toLowerCase()) {
                if (!event.message.trim().startsWith('!')) return;

                // Check user rate limit FIRST, before any processing
                const rateLimitResult = userRateLimiter.checkRateLimit(event.nick);
                if (!rateLimitResult.allowed) {
                    const message = userRateLimiter.getBlockMessage(rateLimitResult);
                    await queue.addToQueue(event.nick, message, true, generateId(), true);
                    userRateLimiter.logRateLimit(event.nick, rateLimitResult);
                    return;
                }

                // Add rate limit info to event for worker validation
                event.rateLimitValid = true;

                // TEMPORARILY DISABLED - Too many Redis errors interfering
                // Will implement error detection in the command flow instead

                let user = null;
                try {
                    user = await global.osuApiClient.getUser(event.nick, "osu", "username");
                } catch (error) {
                    Logger.errorCatch('getUser', `Failed to get user ${event.nick}: ${error.message}`);
                }

                await commandManager.handleMessage(event, queue, lastRequests, user);
            }
        } catch (err) {
            Logger.errorCatch('onMessage', err);
        }
    });

})();

async function gracefulShutdown() {
    try {
        Logger.service('Shutting down gracefully...');

        if (healthMonitor) {
            await healthMonitor.close();
        }

        if (performe) {
            await performe.close();
        }

        if (metricsCollector) {
            await metricsCollector.close();
        }

        if (workerMonitor) {
            workerMonitor.stopMonitoring();
        }

        if (osuApiInternalServer) {
            await osuApiInternalServer.stop();
            Logger.service('OsuApi internal server stopped');
        }

        Logger.service('Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        Logger.errorCatch('gracefulShutdown', error);
        process.exit(1);
    }
}

process.on('uncaughtException', (err) => {
    // Don't spam logs for connection errors during testing
    if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' ||
        err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') {
        // Only log once every 10 seconds to avoid spam
        if (!global.lastConnectionErrorLog || Date.now() - global.lastConnectionErrorLog > 10000) {
            Logger.service(`Connection error (expected during testing): ${err.code}`);
            global.lastConnectionErrorLog = Date.now();
        }
    } else {
        Logger.errorCatch('uncaughtException', err);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    // Don't spam logs for connection errors during testing
    if (reason && (reason.code === 'ECONNRESET' || reason.code === 'ECONNREFUSED' ||
        reason.code === 'EHOSTUNREACH' || reason.code === 'ENETUNREACH')) {
        // Only log once every 10 seconds to avoid spam
        if (!global.lastConnectionErrorLog || Date.now() - global.lastConnectionErrorLog > 10000) {
            Logger.service(`Connection rejection (expected during testing): ${reason.code}`);
            global.lastConnectionErrorLog = Date.now();
        }
    } else {
        Logger.errorCatch('unhandledRejection', reason);
    }
});

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

function getOsuApiClient() {
    if (!global.osuApiClient) {
        throw new Error('OsuApiClient not initialized. Make sure the server has started properly.');
    }
    return global.osuApiClient;
}

module.exports = {
    getOsuApiClient
};
