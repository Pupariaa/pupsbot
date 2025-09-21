const { getUser } = require('../services/OsuApiV1');
const Thread2Database = require('../services/SQL');
const RedisStore = require('../services/RedisStore');
const Logger = require('../utils/Logger');
const MetricsCollector = require('../services/MetricsCollector');

module.exports = {
    name: 'info',
    async execute(event, args, queue) {
        const performe = new RedisStore();
        const db = new Thread2Database();
        const metricsCollector = new MetricsCollector();

        try {
            await metricsCollector.init();
            await metricsCollector.createCommandEntry(event.id, 'info');
            await performe.markPending(event.id);
            await db.connect();

            const u = await getUser(event.nick);
            const responseMessage = u.locale === 'FR'
                ? `Pupsbot V2 (Anciennement Puparia V1) est un bot qui vous donne des beatmaps parfaites pour gagner des PP. Elles sont choisies parmi les maps jamais jouées ou absentes de votre top 100, mais présentes dans le top 100 d'autres joueurs proches de votre niveau. Plus de 50M de scores sont stockées en Redis (ultra rapide), avec compatibilité HD/HR/DT/NF/EZ, et un algorithme qui calcule votre target PP pour maximiser vos gains. Le /np reste dispo pour estimer vos gains PP avec ou sans mods. Pour soutenir le projet, voici [https://ko-fi.com/bellafiora le lien kofi] Thanks-u ♥`
                : `Pupsbot V2 (Formerly Puparia V1) is a bot that gives you perfect beatmaps to earn PP. They are chosen from maps never played or absent from your top 100, but present in the top 100 of other players close to your level. More than 50M of scores are stored in Redis (ultra fast), with HD/HR/DT/NF/EZ compatibility, and an algorithm that calculates your target PP to maximize your gains. The /np remains available to estimate your PP earnings with or without mods. To support the project, here is [https://ko-fi.com/bellafiora le lien kofi] Thanks-u ♥`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
            await metricsCollector.updateCommandResult(event.id, 'success');
        } catch (err) {
            Logger.errorCatch('Command::info', err);
            await metricsCollector.updateCommandResult(event.id, 'error');
            await queue.addToQueue(event.nick, "An error occurred while executing the info command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
                await metricsCollector.close();
            } catch (e) {
                Logger.errorCatch('Command::info::disconnect', e);
            }
        }
    }
};
