const Logger = require('../utils/Logger');
const ErrorHandler = require('../utils/ErrorHandler');
const GameModeManager = require('../services/GameModeManager');
const { getTop100MultiModes, getBeatmap } = require('../services/OsuApiV1');
const parseCommandParameters = require('../utils/parser/commandParser');
const { SendBeatmapMessage, SendNotFoundBeatmapMessage } = require('../utils/messages');

require('dotenv').config();

const logger = new Logger();
const errorHandler = new ErrorHandler();
const gameModeManager = new GameModeManager();

process.on('message', async (data) => {
    const startTime = Date.now();
    let response = null;
    
    try {
        logger.info('MANIA_WORKER', 'Processing mania command request', {
            user: data.event?.nick,
            messageId: data.event?.id
        });

        if (!data.event || !data.event.message) {
            throw new Error('Invalid event data received');
        }

        const params = parseCommandParameters(data.event.message, 'mania');
        logger.debug('MANIA_WORKER', 'Parsed command parameters', { params });

        const mode = gameModeManager.getModeInfo('mania');
        if (!mode || !mode.enabled) {
            response = {
                username: data.event.nick,
                response: 'osu!mania mode is currently not available. Please try again later.',
                success: false,
                id: data.event.id
            };
            return;
        }

        gameModeManager.logModeUsage('mania', 'COMMAND_REQUEST', {
            user: data.event.nick,
            command: 'mania',
            parameters: params
        });

        if (params.type === 'top' || params.type === 'recent') {
            const userId = data.user?.id || data.event.nick;
            const topData = await getTop100MultiModes(userId, data.event.id);
            
            if (!topData.mania || !topData.mania.possibles || topData.mania.possibles.length === 0) {
                response = {
                    username: data.event.nick,
                    response: 'No mania scores found or insufficient data for PP calculations.',
                    success: false,
                    id: data.event.id
                };
                return;
            }

            const locale = data.user?.locale || 'EN';
            const isFR = locale === 'FR';
            
            const topGains = topData.mania.possibles.slice(0, 5);
            const gainsText = topGains.map((gain, index) => 
                `${index + 1}. ${gain.brut}pp (+${gain.gain}pp)`
            ).join(' | ');

            response = {
                username: data.event.nick,
                response: `🎹 ${isFR ? 'Gains PP possibles en osu!mania' : 'Possible PP gains in osu!mania'}: ${gainsText}`,
                success: true,
                id: data.event.id
            };

        } else if (params.type === 'beatmap' && params.beatmapId) {
            const beatmap = await getBeatmap(params.beatmapId, 3);
            
            if (!beatmap) {
                response = SendNotFoundBeatmapMessage(data.event.nick, data.event.id, data.user?.locale);
                return;
            }

            const keyCount = gameModeManager.getManiaKeyCount(beatmap.diff_cs);
            const locale = data.user?.locale || 'EN';
            const isFR = locale === 'FR';

            response = {
                username: data.event.nick,
                response: `🎹 ${beatmap.title} [${beatmap.version}] | ${keyCount}K | ${isFR ? 'Difficulté' : 'Difficulty'}: ${parseFloat(beatmap.difficultyrating).toFixed(2)}* | ${isFR ? 'Durée' : 'Length'}: ${Math.floor(beatmap.total_length / 60)}:${(beatmap.total_length % 60).toString().padStart(2, '0')}`,
                success: true,
                id: data.event.id
            };

        } else {
            const locale = data.user?.locale || 'EN';
            const isFR = locale === 'FR';
            
            response = {
                username: data.event.nick,
                response: isFR 
                    ? '🎹 Commande mania: !m [top|recent] ou !m avec un lien de beatmap'
                    : '🎹 Mania command: !m [top|recent] or !m with a beatmap link',
                success: false,
                id: data.event.id
            };
        }

    } catch (error) {
        errorHandler.handleError(error, 'MANIA_WORKER', {
            user: data.event?.nick,
            messageId: data.event?.id,
            message: data.event?.message
        });

        const locale = data.user?.locale || 'EN';
        const isFR = locale === 'FR';
        
        response = {
            username: data.event.nick,
            response: isFR 
                ? 'Une erreur s\'est produite lors du traitement de votre commande mania.'
                : 'An error occurred while processing your mania command.',
            success: false,
            id: data.event.id
        };

    } finally {
        if (response) {
            process.send(response);
        }

        const duration = Date.now() - startTime;
        logger.performance('MANIA_WORKER', duration, {
            user: data.event?.nick,
            success: response?.success || false
        });

        process.removeAllListeners();
        if (global.gc) global.gc();
        setTimeout(() => process.exit(0), 100);
    }
});