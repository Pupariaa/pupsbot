const { getUser } = require('../services/OsuApiV1');
const Thread2Database = require('../services/SQL');
const Performe = require('../services/Performe');
const Logger = require('../utils/Logger');

module.exports = {
    name: 'teams',
    async execute(event, args, queue) {
        const performe = new Performe();
        const db = new Thread2Database();

        try {
            await performe.markPending(event.id);
            await db.connect();

            const u = await getUser(event.nick);
            const responseMessage = u.locale === 'FR'
                ? `Rejoins la team Pupsbot ! [https://osu.ppy.sh/teams/26792 BSBT TEAM]`
                : `Join the Pupsbot team ! [https://osu.ppy.sh/teams/26792 BSBT TEAM]`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
        } catch (err) {
            Logger.errorCatch('Command::teams', err);
            await queue.addToQueue(event.nick, "An error occurred while executing the teams command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
            } catch (e) {
                Logger.errorCatch('Command::teams::disconnect', e);
            }
        }
    }
};
