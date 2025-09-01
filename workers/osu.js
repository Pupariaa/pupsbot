const Logger = require('../utils/Logger');
const ErrorHandler = require('../utils/ErrorHandler');
const GameModeManager = require('../services/GameModeManager');
const { getTop100MultiModes, getBeatmap } = require('../services/OsuApiV1');
const parseCommandParameters = require('../utils/parser/commandParser');

require('dotenv').config();

const logger = new Logger();
const errorHandler = new ErrorHandler();
const gameModeManager = new GameModeManager();

process.on('message', async (data) => {
    const startTime = Date.now();
    let response = null;
    
    try {
        logger.info('OSU_WORKER', 'Processing osu command request', {
            user: data.event?.nick,
            messageId: data.event?.id
        });

        if (!data.event || !data.event.message) {
            throw new Error('Invalid event data received');
        }

        const params = parseCommandParameters(data.event.message, 'osu');
        logger.debug('OSU_WORKER', 'Parsed command parameters', { params });

        const mode = gameModeManager.getModeInfo('osu');
        if (!mode || !mode.enabled) {
            response = {
                username: data.event.nick,
                response: 'osu! mode is currently not available. Please try again later.',
                success: false,
                id: data.event.id
            };
            return;
        }

        gameModeManager.logModeUsage('osu', 'COMMAND_REQUEST', {
            user: data.event.nick,
            command: 'osu',
            parameters: params
        });

        // Pour l'instant, retournons une suggestion basique basée sur les top scores
        const userId = data.user?.id || data.event.nick;
        const topData = await getTop100MultiModes(userId, data.event.id);
        
        if (!topData.osu || !topData.osu.possibles || topData.osu.possibles.length === 0) {
            const locale = data.user?.locale || 'EN';
            const isFR = locale === 'FR';
            
            response = {
                username: data.event.nick,
                response: isFR
                    ? '⭕ Aucun gain PP trouvé ou données insuffisantes pour des suggestions osu!. Essayez de jouer plus de beatmaps ranked.'
                    : '⭕ No PP gains found or insufficient data for osu! suggestions. Try playing more ranked beatmaps.',
                success: false,
                id: data.event.id
            };
            return;
        }

        const locale = data.user?.locale || 'EN';
        const isFR = locale === 'FR';
        
        // Sélectionner un gain PP potentiel
        const topGains = topData.osu.possibles.slice(0, 10);
        const randomGain = topGains[Math.floor(Math.random() * topGains.length)];
        
        if (randomGain) {
            response = {
                username: data.event.nick,
                response: isFR
                    ? `⭕ Suggestion osu!: Un score de ${randomGain.brut}pp te ferait gagner +${randomGain.gain}pp (position #${randomGain.position} dans ton top). Continue à t'améliorer !`
                    : `⭕ osu! suggestion: A ${randomGain.brut}pp score would give you +${randomGain.gain}pp (rank #${randomGain.position} in your top). Keep improving!`,
                success: true,
                id: data.event.id
            };
        } else {
            response = {
                username: data.event.nick,
                response: isFR
                    ? '⭕ Aucune suggestion disponible pour le moment. Essayez de jouer plus de beatmaps ranked.'
                    : '⭕ No suggestions available right now. Try playing more ranked beatmaps.',
                success: false,
                id: data.event.id
            };
        }

    } catch (error) {
        errorHandler.handleError(error, 'OSU_WORKER', {
            user: data.event?.nick,
            messageId: data.event?.id,
            message: data.event?.message
        });

        const locale = data.user?.locale || 'EN';
        const isFR = locale === 'FR';
        
        response = {
            username: data.event.nick,
            response: isFR 
                ? 'Une erreur s\'est produite lors du traitement de votre commande osu!.'
                : 'An error occurred while processing your osu! command.',
            success: false,
            id: data.event.id
        };

    } finally {
        if (response) {
            process.send(response);
        }

        const duration = Date.now() - startTime;
        logger.performance('OSU_WORKER', duration, {
            user: data.event?.nick,
            success: response?.success || false
        });

        process.removeAllListeners();
        if (global.gc) global.gc();
        setTimeout(() => process.exit(0), 100);
    }
});