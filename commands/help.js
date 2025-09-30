
const Logger = require('../utils/Logger');
const ErrorHandler = require('../utils/ErrorHandler');
const MetricsCollector = require('../services/MetricsCollector');

const logger = new Logger();
const errorHandler = new ErrorHandler();

module.exports = {
    name: 'help',
    description: 'Show available commands and their usage',
    usage: '!help',

    async execute(event, args, queue, lastRequests, user = null) {
        const startTime = Date.now();
        const metricsCollector = new MetricsCollector();

        try {
            await metricsCollector.init();
            await metricsCollector.createCommandEntry(event.id, 'help');

            logger.info('HELP_COMMAND', 'Processing help command', {
                user: event.nick,
                id: event.id
            });

            if (!user) {
                user = await global.osuApiClient.getUser(event.nick);
            }
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
                ? `🤖 Commandes disponibles: ${commandList} | Utilise /np avec une beatmap pour les gains PP | Nouveaux filtres: pp:150 bpm:180 | Exemple: !o HD pp:200 bpm:160
                Si jamais tu as des difficulté tu peux rejoindre ce serveur [https://discord.gg/bJQVPzy2u6 Discord]`
                : `🤖 Available commands: ${commandList} | Use /np with a beatmap for PP gains | New filters: pp:150 bpm:180 | Example: !o HD pp:200 bpm:160
                If you have any issues, you can join this server [https://discord.gg/bJQVPzy2u6 Discord]`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await metricsCollector.updateCommandResult(event.id, 'success');

            const duration = Date.now() - startTime;
            logger.performance('HELP_COMMAND', duration, {
                user: event.nick,
                success: true
            });

        } catch (error) {
            await metricsCollector.updateCommandResult(event.id, 'error');
            errorHandler.handleError(error, 'HELP_COMMAND', {
                user: event.nick,
                id: event.id
            });

            const errorMsg = user?.locale === 'FR'
                ? 'Une erreur s\'est produite lors de l\'affichage de l\'aide.'
                : 'An error occurred while displaying help.';

            await queue.addToQueue(event.nick, errorMsg, false, event.id, false);
        } finally {
            try {
                await metricsCollector.close();
            } catch (e) {
                Logger.errorCatch('help::disconnect', e);
            }
        }
    }
};
