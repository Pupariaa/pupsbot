const Thread2Database = require('../services/SQL');
const RedisStore = require('../services/RedisStore');
const Logger = require('../utils/Logger');
const MetricsCollector = require('../services/MetricsCollector');

module.exports = {
    name: '727',
    async execute(event, args, queue, lastRequests, user = null) {
        const performe = new RedisStore();
        const db = new Thread2Database();
        const metricsCollector = new MetricsCollector();

        try {
            await metricsCollector.init();
            await metricsCollector.createCommandEntry(event.id, 'info');
            await performe.markPending(event.id);
            await db.connect();

            if (!user) {
                user = await global.osuApiClient.getUser(event.nick);
            }
            const u = user;
            const responseMessage = u.locale === 'FR'
                ? `J’ai trouvé une beatmap que tu ne devrais surtout pas jouer : [https://osu.ppy.sh/b/58127 — xi – Blue Zenith] (FOUR DIMENSIONS) | Gain estimé : 727 pp (ne choke pas comme dans l’histoire) | Durée : 2:21 | 7.84 ★ | AR10 CS4 OD10 HP6 | Selon osu!, ton rank-up potentiel : douleur.`
                : `I found this beatmap that you definitely shouldn’t play: [https://osu.ppy.sh/b/58127 xi – Blue Zenith] (FOUR DIMENSIONS) | Estimated PP gain: 727pp (don’t choke like history) | Duration: 2:21 | 7.84 ★ | AR10 CS4 OD10 HP6 | Your target rankup according to osu!: pain.`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
            await metricsCollector.updateCommandResult(event.id, 'success');
        } catch (err) {
            Logger.errorCatch('Command::727', err);
            await metricsCollector.updateCommandResult(event.id, 'error');
            await queue.addToQueue(event.nick, "An error occurred while executing the 727 command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
                await metricsCollector.close();
            } catch (e) {
                Logger.errorCatch('Command::727::disconnect', e);
            }
        }
    }
};
