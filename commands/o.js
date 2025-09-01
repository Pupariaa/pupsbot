const { getUser } = require('../services/OsuApiV1');
const fork = require('child_process').fork;
const Logger = require('../utils/Logger');
const ErrorHandler = require('../utils/ErrorHandler');
const GameModeManager = require('../services/GameModeManager');
const path = require('path');

const logger = new Logger();
const errorHandler = new ErrorHandler();
const gameModeManager = new GameModeManager();

module.exports = {
    name: 'o',
    description: 'osu! beatmap suggestions and calculations',
    usage: '!o [mods] - Get beatmap suggestions for osu!',
    
    async execute(event, args, queue) {
        const startTime = Date.now();
        
        try {
            logger.info('OSU_COMMAND', 'Processing osu command', {
                user: event.nick,
                args: args,
                id: event.id
            });

            if (!gameModeManager.isModeEnabled('osu')) {
                const errorMsg = event.user?.locale === 'FR' 
                    ? 'Le mode osu! n\'est pas disponible actuellement.'
                    : 'osu! mode is currently not available.';
                    
                await queue.addToQueue(event.nick, errorMsg, false, event.id, false);
                return;
            }

            gameModeManager.logModeUsage('osu', 'COMMAND_EXECUTE', {
                user: event.nick,
                args: args
            });

            const workerPath = path.join(__dirname, '..', 'workers', 'osu.js');
            const child = fork(workerPath, [], {
                stdio: 'pipe',
                timeout: 30000
            });

            let user;
            try {
                user = await getUser(event.nick, event.id);
            } catch (userError) {
                logger.warn('OSU_COMMAND', 'Failed to fetch user data, using defaults', {
                    user: event.nick,
                    error: userError.message
                });
                user = { locale: 'EN', id: null };
            }

            const messageData = { event, user, args };
            
            child.send(messageData);

            child.on('message', async (msgFromWorker) => {
                try {
                    if (msgFromWorker && msgFromWorker.username && msgFromWorker.response) {
                        await queue.addToQueue(
                            msgFromWorker.username,
                            msgFromWorker.response,
                            false,
                            msgFromWorker.id,
                            msgFromWorker.success
                        );
                        
                        const duration = Date.now() - startTime;
                        logger.performance('OSU_COMMAND', duration, {
                            user: event.nick,
                            success: msgFromWorker.success
                        });
                    }
                } catch (queueError) {
                    errorHandler.handleError(queueError, 'OSU_COMMAND_QUEUE', {
                        user: event.nick,
                        id: event.id
                    });
                } finally {
                    child.kill();
                }
            });

            child.on('error', (workerError) => {
                errorHandler.handleError(workerError, 'OSU_COMMAND_WORKER', {
                    user: event.nick,
                    id: event.id
                });
                child.kill();
            });

            child.on('exit', (code, signal) => {
                if (code !== 0) {
                    logger.warn('OSU_COMMAND', 'Worker process exited with non-zero code', {
                        code,
                        signal,
                        user: event.nick
                    });
                }
            });

            setTimeout(() => {
                if (!child.killed) {
                    logger.warn('OSU_COMMAND', 'Worker timeout, killing process', {
                        user: event.nick,
                        id: event.id
                    });
                    child.kill('SIGKILL');
                    
                    const timeoutMsg = user.locale === 'FR'
                        ? 'La commande osu! a pris trop de temps à traiter. Veuillez réessayer.'
                        : 'The osu! command took too long to process. Please try again.';
                        
                    queue.addToQueue(event.nick, timeoutMsg, false, event.id, false).catch(() => {});
                }
            }, 25000);

        } catch (error) {
            errorHandler.handleError(error, 'OSU_COMMAND', {
                user: event.nick,
                id: event.id,
                args: args
            });

            const errorMsg = error.userFacing ? error.message : 
                (event.user?.locale === 'FR' 
                    ? 'Une erreur s\'est produite lors de l\'exécution de la commande osu!.'
                    : 'An error occurred while executing the osu! command.');
                    
            await queue.addToQueue(event.nick, errorMsg, false, event.id, false);
        }
    }
};