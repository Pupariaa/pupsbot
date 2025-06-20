const { getUser } = require('../services/osuApi');
const Thread2Database = require('../services/SQL');
const Performe = require('../services/Performe');
module.exports = {
    name: 'support',
    async execute(event, args, queue) {
        const performe = new Performe();
        const db = new Thread2Database();
        await db.connect();
        let u = await getUser(event.nick)
        const responseMessage = u.locale === 'FR' ? `Pour soutenir le projet, voici [https://ko-fi.com/bellafiora le lien kofi] :) Merci ♥`
            : `To support the project, here is [https://ko-fi.com/bellafiora the kofi link] :) Thanks-u ♥`
        await queue.addToQueue(event.nick, responseMessage);
        await db.setHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
        await db.disconnect();
        await performe.markResolved(event.id);
    }
};