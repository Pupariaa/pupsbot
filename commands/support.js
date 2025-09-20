const { getUser } = require('../services/OsuApiV1');
const Thread2Database = require('../services/SQL');
const RedisStore = require('../services/RedisStore');
const Logger = require('../utils/Logger');

module.exports = {
    name: 'support',
    async execute(event, args, queue) {
        const db = new Thread2Database();
        const performe = new RedisStore();

        try {
            await db.connect();
            await performe.markPending(event.id);

            const u = await getUser(event.nick);
            const responseMessage = u.locale === 'FR'
                ? `Pour soutenir le projet, voici [https://ko-fi.com/bellafiora le lien kofi] :) Merci ♥`
                : `To support the project, here is [https://ko-fi.com/bellafiora the kofi link] :) Thanks-u ♥`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
        } catch (err) {
            Logger.errorCatch('Command::support', err);
            await queue.addToQueue(event.nick, "An error occurred while executing the support command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
            } catch (e) {
                Logger.errorCatch('Command::support::disconnect', e);
            }
        }
    }
};
