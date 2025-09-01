const { getUser } = require('../services/OsuApiV1');
const Logger = require('../utils/Logger');
const ErrorHandler = require('../utils/ErrorHandler');

const logger = new Logger();
const errorHandler = new ErrorHandler();

module.exports = {
    name: 'help',
    description: 'Show available commands and their usage',
    usage: '!help',
    
    async execute(event, args, queue) {
        const startTime = Date.now();
        let user = null;
        
        try {
            logger.info('HELP_COMMAND', 'Processing help command', {
                user: event.nick,
                id: event.id
            });

            user = await getUser(event.nick, event.id);
            const isFR = user.locale === 'FR';
            
            const commands = {
                osu: '!o - ' + (isFR ? 'Beatmap suggestion osu!' : 'osu! beatmap suggestion'),
                mania: '!m - ' + (isFR ? 'Commandes osu!mania' : 'osu!mania commands'),
                info: '!info - ' + (isFR ? 'Informations du bot' : 'Bot information'),
                support: '!support - ' + (isFR ? 'Supporter le projet' : 'Support the project'),
                help: '!help - ' + (isFR ? 'Cette aide' : 'This help'),
                version: '!version - ' + (isFR ? 'Version du bot' : 'Bot version')
            };
            
            const commandList = Object.values(commands).join(' | ');
            
            const responseMessage = isFR
                ? `🤖 Commandes disponibles: ${commandList} | Utilise /np avec une beatmap pour les gains PP | Toutes les commandes sont maintenant réactivées !`
                : `🤖 Available commands: ${commandList} | Use /np with a beatmap for PP gains | All commands are now reactivated!`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            
            const duration = Date.now() - startTime;
            logger.performance('HELP_COMMAND', duration, {
                user: event.nick,
                success: true
            });
            
        } catch (error) {
            errorHandler.handleError(error, 'HELP_COMMAND', {
                user: event.nick,
                id: event.id
            });

            const errorMsg = user?.locale === 'FR'
                ? 'Une erreur s\'est produite lors de l\'affichage de l\'aide.'
                : 'An error occurred while displaying help.';
                
            await queue.addToQueue(event.nick, errorMsg, false, event.id, false);
        }
    }
};
