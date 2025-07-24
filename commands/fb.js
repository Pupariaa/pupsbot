const { getUser } = require('../services/OsuApiV1');
const Thread2Database = require('../services/SQL');
const fork = require('child_process').fork;
const Performe = require('../services/Performe');
const Logger = require('../utils/Logger');

module.exports = {
    name: 'fb',
    async execute(event, args, queue) {
        const performe = new Performe();
        const db = new Thread2Database();
        try {
            await performe.markPending(event.id);
            const result = event.message.slice(4);
            if (result.length < 3 || result.length > 1000) {
                await queue.addToQueue(event.nick, "Please provide a feedback between 3 and 1000 characters", false, event.id, false);
                return;
            }
            await db.connect();
            const u = await getUser(event.nick);

            const responseMessage = u.locale === 'FR'
                ? `Merci pour ton retour ♥`
                : `Thanks for your feedback ♥`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveFeedback(event.id, result, u.id, event.nick, u.locale);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
        } catch (e) {
            Logger.errorCatch('fb', e);
            await queue.addToQueue(event.nick, "An error occurred while executing the fb command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
            } catch (e) {
                Logger.errorCatch('fb::disconnect', e);
            }
        }
    }
};
