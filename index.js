require('dotenv').config();
const OsuIRCClient = require("./services/IRC");
const IRCQueueManager = require("./services/Queue");
const CommandManager = require('./services/Commands');
const Performe = require('./services/Performe');
const calculatePPWithMods = require('./utils/osu/PPCalculator');
const generateId = require('./utils/generateId');
const { getUser } = require('./services/osuApi');
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
const performe = new Performe();
performe.init();


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
        performe.logCommand(await t.stop('CMDNP'), 'CMDNP')
        return;
    }
    const summary = result.NoMod;

    lastRequests[nick] = {
        beatmapId,
        timestamp: Date.now(),
        results: result
    };

    const out = `${isFR ? 'PP (FC/NM) pour' : 'PP (FC/NM) for'} (100 %, 98 %, 95 %, 90 %) : ${summary['100']} / ${summary['98']} / ${summary['95']} / ${summary['90']} | ${isFR ? '!mods pour plus de détails' : '!mods for more details'}`;
    performe.logCommand(await t.stop('CMDNP'), 'CMDNP')
    await queue.addToQueue(nick, out);
});

ircBot.onMessage(async (event) => {
    if (event.target.toLowerCase() == process.env.IRC_USERNAME.toLowerCase()) {
        const msg = event.message.trim();
        if (!msg.startsWith('!')) return;
        event.id = id = generateId();
        await commandManager.handleMessage(event, queue, lastRequests);

        child.on('message', async (msgFromWorker) => {
            if (msgFromWorker && msgFromWorker.username && msgFromWorker.response) {
                await queue.addToQueue(msgFromWorker.username, msgFromWorker.response);
            }
        })
    }
});



process.on('uncaughtException', (err) => {
    console.error(err)
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
    console.error(promise);
});