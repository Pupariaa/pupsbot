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
                ? `-- v2.4.0 Nouvelle mise à jour Pupsbot ! --
            - Correctifs mineurs
            - Statistiques plus fiables
            - Budget d'API osu! mieux tenu : les commandes passent en premier, le reste attend son tour
            - Les réponses peuvent prendre un peu plus de temps. C'est le prix pour rester dans le quota
                `
                : `-- v2.4.0 New Pupsbot Update! --
            - Minor fixes
            - Steadier statistics
            - Tighter osu! API budget: commands go first, everything else waits its turn
            - Replies can take a little longer. That is the cost of staying inside the quota
                `;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale, event.from);
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
