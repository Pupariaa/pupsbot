const { getUser } = require('../services/OsuApiV1');
const Logger = require('../utils/Logger');
const ErrorHandler = require('../utils/ErrorHandler');
const fs = require('fs');
const path = require('path');

const logger = new Logger();
const errorHandler = new ErrorHandler();

module.exports = {
    name: 'version',
    description: 'Show current bot version and update information',
    usage: '!version',
    
    async execute(event, args, queue) {
        const startTime = Date.now();
        let user = null;
        
        try {
            logger.info('VERSION_COMMAND', 'Processing version command', {
                user: event.nick,
                id: event.id
            });

            user = await getUser(event.nick, event.id);
            const isFR = user.locale === 'FR';
            
            let version = '5.0.0';
            let buildDate = 'August 15, 2025';
            
            // Essayer de lire le package.json
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
                ? `🚀 Version de Pupsbot: ${version} | 📅 Build: ${buildDate} | ✨ Nouveautés: Sécurité renforcée, multi-mode osu!/mania, logs améliorés | 🔗 ${link}`
                : `🚀 Pupsbot version: ${version} | 📅 Build: ${buildDate} | ✨ New: Enhanced security, multi-mode osu!/mania, improved logging | 🔗 ${link}`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            
            const duration = Date.now() - startTime;
            logger.performance('VERSION_COMMAND', duration, {
                user: event.nick,
                success: true
            });
            
        } catch (error) {
            errorHandler.handleError(error, 'VERSION_COMMAND', {
                user: event.nick,
                id: event.id
            });

            const errorMsg = user?.locale === 'FR'
                ? 'Une erreur s\'est produite lors de l\'affichage de la version.'
                : 'An error occurred while displaying version information.';
                
            await queue.addToQueue(event.nick, errorMsg, false, event.id, false);
        }
    }
};