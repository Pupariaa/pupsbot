require('dotenv').config();
const os = require('os');
const OsuIRCClient = require("./services/IRC");
const IRCQueueManager = require("./services/Queue");
const CommandManager = require('./services/Commands');
const Performe = require('./services/Performe');
const calculatePPWithMods = require('./utils/osu/PPCalculator');
const { getUser, hasUserPlayedMap } = require('./services/OsuApiV1');
const Logger = require('./utils/Logger');
const generateId = require('./utils/generateId');

const performe = new Performe();
performe.init();
global.temp = [];
const trackers = [];

const { monitorEventLoopDelay, PerformanceObserver, constants } = require('node:perf_hooks');

const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();

const gcTypes = {
    [constants.NODE_PERFORMANCE_GC_MAJOR]: 'major',
    [constants.NODE_PERFORMANCE_GC_MINOR]: 'minor',
    [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental',
    [constants.NODE_PERFORMANCE_GC_WEAKCB]: 'weakcb'
};

const gcLog = [];
const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        gcLog.push({ type: gcTypes[entry.kind] || 'unknown', duration: entry.duration });
    }
});
gcObserver.observe({ entryTypes: ['gc'] });

async function getCPUUsagePercent(durationMs = 100) {
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
        userCPU: elapUserMs.toFixed(2),
        systemCPU: elapSysMs.toFixed(2),
        cpuPercent: cpuPercent.toFixed(2)
    };
}

setInterval(() => {
    try {
        const mem = process.memoryUsage();
        const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
        const rssMB = (mem.rss / 1024 / 1024).toFixed(2);
        const externalMB = (mem.external / 1024 / 1024).toFixed(2);

        const res = process.resourceUsage();
        const maxRSSMB = (res.maxRSS / 1024).toFixed(2);

        const lagMean = loopDelay.mean / 1e6;
        const lagMax = loopDelay.max / 1e6;
        const lagStddev = loopDelay.stddev / 1e6;

        const recentGCs = gcLog.splice(0, gcLog.length);
        const gcSummary = recentGCs.length
            ? recentGCs.map(gc => `${gc.type} (${gc.duration.toFixed(1)}ms)`).join(', ')
            : 'none';

        performe.logDuration('HEAP', heapUsedMB);
        performe.logDuration('RSS', rssMB);
        performe.logDuration('HEAPEXT', externalMB);
        performe.logDuration('MRSS', maxRSSMB);
        performe.logDuration('ELOOPLMEN', lagMean.toFixed(2));
        performe.logDuration('ELOOPLMAX', lagMax.toFixed(2));
        performe.logDuration('ELOOPLDTDDEV', lagStddev.toFixed(2));
        performe.logDuration('GCOL', gcSummary);

        getCPUUsagePercent().then(res => {
            performe.logDuration('UCPU', res.userCPU);
            performe.logDuration('SCPU', res.systemCPU);
        });
    } catch (err) {
        Logger.errorCatch('MonitorInterval', err);
    }
}, 1000);


async function refreshTrackers(performe) {
    const entries = await performe.getAllTrackedSuggestions();
    const now = Date.now();

    for (const { id, uid, bmid, length } of entries) {
        const key = `track:${id}`;
        if (trackers.some(t => t.key === key)) continue;

        Logger.trackSuccess(`Added: USER:${uid} BMID:${bmid} ID:${id} length:${length}s (+2min buffer)`);

        const action = async () => {
            Logger.track(`→ Check USER:${uid} BMID:${bmid} (ID:${id})`);

            const played = await hasUserPlayedMap(uid, bmid);
            const index = trackers.findIndex(t => t.key === key);

            if (played || (trackers[index]?.retries ?? 0) >= 1) {
                if (index !== -1) trackers.splice(index, 1);
                Logger.trackSuccess(`Score detected or no retries → Delete ID:${id}`);
            } else {
                if (index !== -1) trackers.splice(index, 1);
                Logger.track(`No score → Retry in 10min (ID:${id})`);

                trackers.push({
                    key,
                    uid,
                    bmid,
                    duration: 10 * 60 * 1000,
                    start: Date.now(),
                    retries: 1,
                    action
                });
            }
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
            Logger.trackSuccess(`Execute USER=${tracker.uid} BMID:${tracker.bmid} after ${Math.round(elapsed / 1000)}s`);
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
        channel: "#osu"
    });

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
} catch (err) {
    Logger.errorCatch('Startup', err);
}

setInterval(() => {
    performe.heartbeat().catch(err => Logger.errorCatch('Heartbeat', err));
}, 10);

ircBot?.onAction(async ({ target, message, nick }) => {
    const t = performe.startTimer();
    try {
        if (target !== process.env.IRC_USERNAME) return;

        const beatmapId = (message.match(/\/b\/(\d+)/) || message.match(/beatmapsets\/\d+#\/(\d+)/) || [])[1];
        if (!beatmapId) return;
        const id = generateId()
        Logger.task(`Create: /np → ${id}`);

        const user = await getUser(nick);
        const isFR = user.locale === 'FR';
        const result = await calculatePPWithMods(beatmapId);

        if (result.error) {
            await queue.addToQueue(nick, result.error, false, id, false);
            performe.logDuration('NP', await t.stop('NP'));
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
        performe.logDuration('NP', await t.stop('NP'));
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

process.on('uncaughtException', (err) => {
    Logger.errorCatch('uncaughtException', err);
});

process.on('unhandledRejection', (reason, promise) => {
    Logger.errorCatch('unhandledRejection', reason);
});