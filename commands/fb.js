
const Thread2Database = require('../services/SQL');
const fork = require('child_process').fork;
const RedisStore = require('../services/RedisStore');
const Logger = require('../utils/Logger');
const MetricsCollector = require('../services/MetricsCollector');

module.exports = {
    name: 'fb',
    async execute(event, args, queue, lastRequests, user = null) {
        const performe = new RedisStore();
        const db = new Thread2Database();
        const metricsCollector = new MetricsCollector();

        try {
            await metricsCollector.init();
            await metricsCollector.createCommandEntry(event.id, 'fb');
            await performe.markPending(event.id);
            const result = event.message.slice(4);
            if (result.length < 3 || result.length > 1000) {
                await metricsCollector.updateCommandResult(event.id, 'invalid_length');
                await queue.addToQueue(event.nick, "Please provide a feedback between 3 and 1000 characters", false, event.id, false);
                return;
            }
            await db.connect();
            if (!user) {
                user = await global.osuApiClient.getUser(event.nick);
            }
            const u = user;

            const responseMessage = u.locale === 'FR'
                ? `Merci pour ton retour ♥`
                : `Thanks for your feedback ♥`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveFeedback(event.id, result, u.id, event.nick, u.locale);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
            await metricsCollector.updateCommandResult(event.id, 'success');
        } catch (e) {
            Logger.errorCatch('fb', e);
            await metricsCollector.updateCommandResult(event.id, 'error');
            await queue.addToQueue(event.nick, "An error occurred while executing the fb command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
                await metricsCollector.close();
            } catch (e) {
                Logger.errorCatch('fb::disconnect', e);
            }
        }
    }
};
