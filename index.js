require('dotenv').config();
process.env.TZ = 'UTC+2';

const OsuIRCClient = require("./services/IRC");
const IRCQueueManager = require("./services/Queue");
const CommandManager = require('./services/Commands');
const calculatePPWithMods = require('./utils/osu/PPCalculator');
const { getUser, hasUserPlayedMap } = require('./services/OsuApiV1');
const Logger = require('./utils/Logger');
const ErrorHandler = require('./utils/ErrorHandler');
const GameModeManager = require('./services/GameModeManager');
const generateId = require('./utils/generateId');
const Notifier = require('./services/Notifier');

const logger = new Logger();
const errorHandler = new ErrorHandler();
const gameModeManager = new GameModeManager();
const notifier = new Notifier();

errorHandler.setupGlobalHandlers();

process.on('uncaughtException', async (err) => {
    errorHandler.handleError(err, 'UNCAUGHT_EXCEPTION', { critical: true });
    await notifier.send('Critical Error - Uncaught Exception', err.message).catch(() => {});
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    errorHandler.handleError(error, 'UNHANDLED_REJECTION', { promise: promise.toString() });
    await notifier.send('Unhandled Promise Rejection', error.message).catch(() => {});
});

(async () => {
    try {
        errorHandler.validateEnvironment();
        logger.info('STARTUP', 'Starting Pupsbot with enhanced security and multi-mode support');
        logger.info('STARTUP', `Supported modes: ${gameModeManager.getEnabledModes().join(', ')}`);

        global.temp = [];

        const ircBot = new OsuIRCClient({
            username: process.env.IRC_USERNAME,
            password: process.env.IRC_PASSWORD,
            channel: "#osu",
        }, notifier);

        const queue = new IRCQueueManager(
            (target, message) => ircBot.sendMessage(message, target),
            {
                maxConcurrent: 4,
                ratePerSecond: 4,
                maxRetries: 2,
                enableLogs: true
            }
        );

        await ircBot.connect();
        logger.info('STARTUP', 'IRC client connected successfully');

        const lastRequests = new Map();
        
        ircBot.onAction(async ({ target, message, nick }) => {
            const startTime = Date.now();
            const id = generateId();
            
            try {
                if (target !== process.env.IRC_USERNAME) return;

                const beatmapId = (message.match(/\/b\/(\d+)/) || message.match(/beatmapsets\/\d+#\/(\d+)/) || [])[1];
                if (!beatmapId) return;
                
                logger.info('NP_COMMAND', `Processing /np request for beatmap ${beatmapId}`, { nick, id });

                const user = await getUser(nick, id);
                const isFR = user.locale === 'FR';
                
                const currentMode = gameModeManager.parseMode('osu');
                gameModeManager.logModeUsage(currentMode, 'NP_REQUEST', { user: nick, beatmapId });
                
                const result = await calculatePPWithMods(beatmapId);

                if (result.error) {
                    await queue.addToQueue(nick, result.error, false, id, false);
                    logger.warn('NP_COMMAND', `PP calculation failed for beatmap ${beatmapId}`, { error: result.error, id });
                    return;
                }

                const summary = result.NoMod;
                lastRequests.set(nick, {
                    beatmapId,
                    timestamp: Date.now(),
                    results: result,
                    mode: currentMode
                });

                const out = `${isFR ? 'PP (FC/NM) pour' : 'PP (FC/NM) for'} (100%, 98%, 95%, 90%): ${summary['100']} / ${summary['98']} / ${summary['95']} / ${summary['90']} | ${isFR ? '!mods pour plus de détails' : '!mods for more details'}`;

                const duration = Date.now() - startTime;
                logger.performance('NP_COMMAND', duration, { user: nick, beatmapId, id });
                
                await queue.addToQueue(nick, out, false, id, true);
            } catch (err) {
                errorHandler.handleError(err, 'NP_COMMAND', { nick, target, id });
                const errorMsg = err.userFacing ? err.message : 'An error occurred while processing your /np request.';
                await queue.addToQueue(nick, errorMsg, false, id, false);
            }
        });

        ircBot.onMessage(async (event) => {
            try {
                if (event.target.toLowerCase() !== process.env.IRC_USERNAME.toLowerCase()) {
                    return;
                }
                
                if (!event.message.trim().startsWith('!')) return;
                
                // Générer un ID pour cette commande si pas déjà présent
                if (!event.id) {
                    event.id = generateId();
                }
                
                logger.info('COMMAND', `Received command: ${event.message}`, { 
                    nick: event.nick, 
                    id: event.id,
                    target: event.target
                });
                
                const user = await getUser(event.nick, event.id);
                const commandManager = new CommandManager(gameModeManager);
                
                try {
                    await commandManager.handleMessage(event, queue, lastRequests);
                } catch (commandError) {
                    if (commandError.userFacing) {
                        await queue.addToQueue(event.nick, commandError.message, false, event.id, false);
                    } else {
                        const responseMessage = user.locale === 'FR'
                            ? `Une erreur s'est produite lors du traitement de votre commande. Veuillez réessayer.`
                            : `An error occurred while processing your command. Please try again.`;
                        await queue.addToQueue(event.nick, responseMessage, false, event.id, false);
                    }
                    throw commandError;
                }
                
            } catch (err) {
                errorHandler.handleError(err, 'MESSAGE_HANDLER', {
                    nick: event?.nick,
                    message: event?.message,
                    id: event?.id
                });
            }
        });
        
        logger.info('STARTUP', 'Bot initialization completed successfully');
        
    } catch (startupError) {
        errorHandler.handleError(startupError, 'STARTUP', { critical: true });
        process.exit(1);
    }
})().catch(err => {
    errorHandler.handleError(err, 'MAIN', { critical: true });
    process.exit(1);
});