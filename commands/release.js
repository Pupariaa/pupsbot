const Thread2Database = require('../services/SQL');
const RedisStore = require('../services/RedisStore');
const Logger = require('../utils/Logger');
const MetricsCollector = require('../services/MetricsCollector');

module.exports = {
    name: 'release',
    async execute(event, args, queue, lastRequests, user = null) {
        const performe = new RedisStore();
        const db = new Thread2Database();
        const metricsCollector = new MetricsCollector();

        try {
            await metricsCollector.init();
            await metricsCollector.createCommandEntry(event.id, 'release');
            await performe.markPending(event.id);
            await db.connect();

            if (!user) {
                user = await global.osuApiClient.getUser(event.nick);
            }
            const u = user;
            const responseMessage = u.locale === 'FR'
                ? `-- v2.3.0 Nouvelle mise à jour Pupsbot ! --
            - Renforcement du userRateLimit
            - Implémentation des préférences persistantes
            - 4 nouveaux algorithmes de calcul de PP
            - Fix des bugs et améliorations
            - Dashboard de suivi des suggestions et modifications des préférences [https://pb.pupsweb.cc -> Lien]
                `
                : `-- v2.3.0 New Pupsbot Update! --
            - UserRateLimit enforcement
            - Persistent preferences implementation
            - 4 new PP calculation algorithms
            - Bug fixes and improvements
            - Dashboard for tracking suggestions and modifying preferences [https://pb.pupsweb.cc -> Link]
                `;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
            await metricsCollector.updateCommandResult(event.id, 'success');
        } catch (err) {
            Logger.errorCatch('Command::release', err);
            await metricsCollector.updateCommandResult(event.id, 'error');
            await queue.addToQueue(event.nick, "An error occurred while executing the release command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
                await metricsCollector.close();
            } catch (e) {
                Logger.errorCatch('Command::release::disconnect', e);
            }
        }
    }
};
