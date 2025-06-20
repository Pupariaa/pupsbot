require('dotenv').config();
const os = require('os');
const OsuIRCClient = require("./services/IRC");
const IRCQueueManager = require("./services/Queue");
const CommandManager = require('./services/Commands');
const Performe = require('./services/Performe');
const calculatePPWithMods = require('./utils/osu/PPCalculator');
const generateId = require('./utils/generateId');
const { getUser } = require('./services/osuApi');
const performe = new Performe();
performe.init();


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

    performe.logDuration('HEAP', heapUsedMB)
    performe.logDuration('RSS', rssMB)
    performe.logDuration('HEAPEXT', externalMB)

    performe.logDuration('MRSS', maxRSSMB)
    performe.logDuration('ELOOPLMEN', lagMean.toFixed(2))
    performe.logDuration('ELOOPLMAX', lagMax.toFixed(2))
    performe.logDuration('ELOOPLDTDDEV', lagStddev.toFixed(2))
    performe.logDuration('GCOL', gcSummary)
    getCPUUsagePercent().then(res => {
        console.log(res)
        performe.logDuration('UCPU', res.userCPU)
        performe.logDuration('SCPU', res.systemCPU)
    });
}, 1000);





const lastRequests = {};
const ircBot = new OsuIRCClient({
    username: process.env.IRC_USERNAME,
    password: process.env.IRC_PASSWORD,
    channel: "#osu"
});

const queue = new IRCQueueManager(
    (target, message) => ircBot.sendMessage(message, target),
    {
        maxConcurrent: 4,
        ratePerSecond: 4,
        maxRetries: 2,
        enableLogs: true
    }
);

setInterval(() => {
    performe.heartbeat().catch(() => { });
}, 10);

const commandManager = new CommandManager();
ircBot.connect();


ircBot.onAction(async ({ target, message, nick }) => {
    const t = performe.startTimer();
    if (target !== process.env.IRC_USERNAME) return;

    const beatmapId = (message.match(/\/b\/(\d+)/) || message.match(/beatmapsets\/\d+#\/(\d+)/) || [])[1];
    if (!beatmapId) return;

    const user = await getUser(nick);
    const isFR = user.locale === 'FR';
    const result = await calculatePPWithMods(beatmapId);
    if (result.error) {
        await queue.addToQueue(nick, result.error);
        performe.logDuration('CMDNP', await t.stop('CMDNP'))
        return;
    }
    const summary = result.NoMod;

    lastRequests[nick] = {
        beatmapId,
        timestamp: Date.now(),
        results: result
    };

    const out = `${isFR ? 'PP (FC/NM) pour' : 'PP (FC/NM) for'} (100 %, 98 %, 95 %, 90 %) : ${summary['100']} / ${summary['98']} / ${summary['95']} / ${summary['90']} | ${isFR ? '!mods pour plus de détails' : '!mods for more details'}`;
    performe.logCommand(user.id, 'CMDNP')
    performe.logDuration('CMDNP', await t.stop('CMDNP'))
    await queue.addToQueue(nick, out);
});

ircBot.onMessage(async (event) => {
    if (event.target.toLowerCase() == process.env.IRC_USERNAME.toLowerCase()) {
        const msg = event.message.trim();
        if (!msg.startsWith('!')) return;
        event.id = id = generateId();
        await commandManager.handleMessage(event, queue, lastRequests);
    }
});


process.on('uncaughtException', (err) => {
    console.error(err)
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
    console.error(promise);
});