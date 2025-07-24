const { getUser } = require('../services/OsuApiV1');
const Thread2Database = require('../services/SQL');
const Performe = require('../services/Performe');
const Logger = require('../utils/Logger');

module.exports = {
    name: 'help',
    async execute(event, args, queue) {
        const performe = new Performe();
        const db = new Thread2Database();

        try {
            await performe.markPending(event.id);
            await db.connect();

            const u = await getUser(event.nick);
            const responseMessage = u.locale === 'FR'
                ? `Commandes disponibles: !bm [Donne une beatmap non jouée (ou jouée il y a longtemps / pas dans ton top rank) mais jouée par quelqu'un de ton rang] <mods> (ex: HDHR ou nm pour uniquement des maps sans mods) | !info [Informations du bot] /np [Donne les pp gains de la map ranked envoyée] | !help [Aide] | !support [Supporter le projet] | !release [Informations sur la mise à jour] | !fb <feedback> pour donner ton avis constructif sur Pupsbot | !teams [Rejoindre la team Pupsbot] | !version [Obtenir la version actuelle de Pupsbot]`
                : `Orders available: !bm [Give a beatmap not played (or played a long time ago / not in your top rank) but played by someone your rank] <mods> (e.g. HDHR or nm to get only no-mod maps) | !info [Bot information] /np [Give the pp earnings of the ranked map sent] | !help [Help] | !support [Support the project] | !release [Update information] | !fb <feedback> to give constructive feedback on Pupsbot | !teams [Join the Pupsbot team] | !version [Get the current version of Pupsbot]`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
        } catch (err) {
            Logger.errorCatch('Command::help', err);
            await queue.addToQueue(event.nick, "An error occurred while executing the help command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
            } catch (e) {
                Logger.errorCatch('Command::help::disconnect', e);
            }
        }
    }
};
