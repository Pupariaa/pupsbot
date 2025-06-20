const { getUser } = require('../services/osuApi');
const Thread2Database = require('../services/SQL');
const Performe = require('../services/Performe');
module.exports = {
    name: 'mods',
    async execute(event, _, queue, lastRequests) {
        const performe = new Performe();
        await performe.markPending(event.id);
        const db = new Thread2Database();
        await db.connect();
        const u = await getUser(event.nick);
        const req = lastRequests[event.nick];
        if (!req) {
            const fallback = u.locale === 'FR'
                ? `Aucune map enregistrée pour toi. Fais d'abord /np sur une map ranked.`
                : `No map registered for you. First do /np on a ranked map.`;
            return await queue.addToQueue(event.nick, fallback);
        }

        const r = req.results;
        const isFR = u.locale === 'FR';

        const mods = ['HD', 'HR', 'DT', 'DTHD', 'DTHR', 'HDHR'];
        const acc = ['100', '98', '95', '90'];

        const headerLabel = isFR
            ? 'Gain de PP (FC) pour'
            : 'PP gain (FC) for';

        let responseMessage = `${headerLabel}  100%   98%   95%   90%\n`;

        for (const mod of mods) {
            const line = acc.map(a => (r[mod]?.[a] || '-').padStart(5)).join(' ');
            responseMessage += mod.padEnd(6) + line + '\n';
        }
        await queue.addToQueue(event.nick, responseMessage.trim(), true);
        await db.setHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
        await db.disconnect();
        await performe.markResolved(event.id);
    }
};
