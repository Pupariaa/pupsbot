const Logger = require('../utils/Logger');
const ErrorHandler = require('../utils/ErrorHandler');
const MetricsCollector = require('../services/MetricsCollector');
const fs = require('fs');
const path = require('path');

const logger = new Logger();
const errorHandler = new ErrorHandler();

module.exports = {
    name: 'version',
    description: 'Show current bot version and update information',
    usage: '!version',

    async execute(event, args, queue, lastRequests, user = null) {
        const startTime = Date.now();
        const metricsCollector = new MetricsCollector();

        try {
            await metricsCollector.init();
            await metricsCollector.createCommandEntry(event.id, 'version');

            logger.info('VERSION_COMMAND', 'Processing version command', {
                user: event.nick,
                id: event.id
            });

            if (!user) {
                user = await global.osuApiClient.getUser(event.nick);
            }
            const isFR = user.locale === 'FR';

            let version = '5.0.0';
            let buildDate = 'August 15, 2025';

            try {
                const pkgPath = path.join(__dirname, '..', 'package.json');
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                version = pkg.version || version;
                buildDate = pkg.date || buildDate;
            } catch (pkgError) {
                logger.debug('VERSION_COMMAND', 'Could not read package.json, using defaults');
            }

            const link = `https://github.com/Pupariaa/pupsbot/tree/v${version}`;

            const responseMessage = isFR
                ? `🚀 Version de Pupsbot: ${version} | 📅 Build: ${buildDate} | ✨ Nouveautés: Système de tracking amélioré, gestion TTL optimisée, sélection intelligente des beatmaps, gestion d'erreurs renforcée | 🔗 [${link} Github]`
                : `🚀 Pupsbot version: ${version} | 📅 Build: ${buildDate} | ✨ New: Enhanced tracking system, optimized TTL management, intelligent beatmap selection, improved error handling | 🔗 [${link} Github]`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await metricsCollector.updateCommandResult(event.id, 'success');

            const duration = Date.now() - startTime;
            Logger.performance('VERSION_COMMAND', duration, {
                user: event.nick,
                success: true
            });

        } catch (error) {
            await metricsCollector.updateCommandResult(event.id, 'error');
            errorHandler.handleError(error, 'VERSION_COMMAND', {
                user: event.nick,
                id: event.id
            });

            const errorMsg = user?.locale === 'FR'
                ? 'Une erreur s\'est produite lors de l\'affichage de la version.'
                : 'An error occurred while displaying version information.';

            await queue.addToQueue(event.nick, errorMsg, false, event.id, false);
        } finally {
            try {
                await metricsCollector.close();
            } catch (e) {
                Logger.errorCatch('version::disconnect', e);
            }
        }
    }
};