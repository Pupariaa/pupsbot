process.env.TZ = 'UTC+2';

const OsuIRCClient = require("./services/IRC");
const IRCQueueManager = require("./services/Queue");
const CommandManager = require('./services/Commands');
const RedisStore = require('./services/RedisStore');
const calculatePPWithMods = require('./utils/osu/PPCalculator');
const { getUser, hasUserPlayedMap } = require('./services/OsuApiV1');
const Logger = require('./utils/Logger');
const generateId = require('./utils/generateId');
const SQL = require('./services/SQL');
const MetricsCollector = require('./services/MetricsCollector');
const Notifier = require('./services/Notifier');
const BotHealthMonitor = require('./services/BotHealthMonitor');
const notifier = new Notifier();

let healthMonitor, performe, metricsCollector;
global.temp = [];


(async () => {

    performe = new RedisStore();
    metricsCollector = new MetricsCollector();
    const db = new SQL();
    healthMonitor = new BotHealthMonitor();

    await performe.init();
    await metricsCollector.init();
    await healthMonitor.init();

    const trackers = [];

    async function refreshTrackers(performe) {
        const entries = await performe.getAllTrackedSuggestions();
        const now = Date.now();

        for (const { id, uid, bmid, length } of entries) {
            const key = `track:${id}`;
            if (trackers.some(t => t.key === key)) continue;

            Logger.trackSuccess(`Tracking: ${id} for user ${uid} on beatmap ${bmid} wait ${length}s (+2min buffer)`);

            const action = async () => {
                const index = trackers.findIndex(t => t.key === key);
                const tracker = trackers[index];
                const suggestionStart = tracker?.start ?? now;
                const retries = tracker?.retries ?? 0;
                const played = await hasUserPlayedMap(uid, bmid);

                if (played && played.date) {
                    const parsedDate = new Date(played.date + 'Z');
                    if (isNaN(parsedDate.getTime())) {
                        if (index !== -1) trackers.splice(index, 1);
                        return;
                    }

                    const scoreDate = parsedDate.getTime();
                    const windowStart = suggestionStart - 20 * 60 * 1000;
                    const windowEnd = suggestionStart + (length + 120 + 600) * 1000;
                    if (scoreDate >= windowStart && scoreDate <= windowEnd) {
                        await db.updateSuggestion(id, played.pp);
                        Logger.trackSuccess(`✅ Score realised → Saved PP:${played.pp} for ID:${id}`);
                    } else {
                        if (retries < 1) {
                            trackers.splice(index, 1);
                            trackers.push({
                                key,
                                uid,
                                bmid,
                                duration: 10 * 60 * 1000,
                                start: Date.now(),
                                retries: retries + 1,
                                action
                            });
                            return;
                        }
                    }
                } else {
                    if (retries < 1) {
                        trackers.splice(index, 1);
                        trackers.push({
                            key,
                            uid,
                            bmid,
                            duration: 10 * 60 * 1000,
                            start: Date.now(),
                            retries: retries + 1,
                            action
                        });
                        return;
                    }
                }

                if (index !== -1) trackers.splice(index, 1);
            };

            trackers.push({
                key,
                uid,
                bmid,
                duration: (length + 120) * 1000,
                start: now,
                retries: 0,
                action
            });
        }
    }
    async function runTrackers() {
        const now = Date.now();
        for (const tracker of [...trackers]) {
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

            const beatmapId = (message.match(/\/b\/(\d+)/) || message.match(/beatmapsets\/\d+#\/(\d+)/) || [])[1];
            if (!beatmapId) return;
            const id = generateId()
            await metricsCollector.createCommandEntry(id, 'np');
            Logger.task(`Create: /np → ${id}`);

            const user = await getUser(nick);
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
                await commandManager.handleMessage(event, queue, lastRequests);
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

        Logger.service('Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        Logger.errorCatch('gracefulShutdown', error);
        process.exit(1);
    }
}

process.on('uncaughtException', (err) => {
    Logger.errorCatch('uncaughtException', err);
});

process.on('unhandledRejection', (reason, promise) => {
    Logger.errorCatch('unhandledRejection', reason);
});

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
