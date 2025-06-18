const { getUser } = require('../services/osuApi');
const Thread2Database = require('../services/SQL');
module.exports = {
    name: 'help',
    async execute(event, args, queue) {
        const db = new Thread2Database();
        await db.connect();
        let u = await getUser(event.nick)
        const responseMessage = u.locale === 'FR' ? `Commandes disponible: !bm[Donne une beatmap non jouée(ou jouée il y a longtemps / pas dans ton top rank) mais jouée par quelqu'un ton rang] <mods> | !info[Informations du bot] /np [Donne les pp gains de la map ranked envoyée] | !help [Aide] | !support [Supporter le projet] | !release [Informations sur la mise à jour]`
            : `Orders available: !bm [Give a beatmap not played (or played a long time ago/not in your top rank) but played by someone your rank] <mods> | !info[Bot information] /np [Give the pp earnings of the ranked map sent] | !help [Help] | !support [Support the project] | !release [Update information]`
        await queue.addToQueue(event.nick, responseMessage);
        await db.setHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
        await db.disconnect();
    }
};