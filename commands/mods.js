const Thread2Database = require('../services/SQL');
const RedisStore = require('../services/RedisStore');
const Logger = require('../utils/Logger');
const MetricsCollector = require('../services/MetricsCollector');

module.exports = {
    name: 'mods',
    async execute(event, _, queue, lastRequests, user = null) {
        const performe = new RedisStore();
        const db = new Thread2Database();
        const metricsCollector = new MetricsCollector();

        try {
            await metricsCollector.init();
            await metricsCollector.createCommandEntry(event.id, 'mods');
            await performe.markPending(event.id);
            await db.connect();

            if (!user) {
                user = await global.osuApiClient.getUser(event.nick);
            }
            const u = user;
            const req = lastRequests[event.nick];

            if (!req) {
                await metricsCollector.updateCommandResult(event.id, 'no_map_registered');
                const fallback = u.locale === 'FR'
                    ? `Aucune map enregistrée pour toi. Fais d'abord /np sur une map ranked.`
                    : `No map registered for you. First do /np on a ranked map.`;
                await queue.addToQueue(event.nick, fallback, false, event.id, false);
                return;
            }

            const r = req.results;
            const isFR = u.locale === 'FR';

            const mods = ['HD', 'HR', 'DT', 'DTHD', 'DTHR', 'HDHR'];
            const acc = ['100', '98', '95', '90'];

            const headerLabel = isFR ? 'Gain de PP (FC) pour' : 'PP gain (FC) for';
            let responseMessage = `${headerLabel}  100%   98%   95%   90%\n`;

            for (const mod of mods) {
                const line = acc.map(a => (r[mod]?.[a] || '-').padStart(5)).join(' ');
                responseMessage += mod.padEnd(6) + line + '\n';
            }

            await queue.addToQueue(event.nick, responseMessage.trim(), true, u.id, true);
            await db.saveCommandHistory(event.id, event.message, responseMessage, event.id, event.nick, true, 0, u.locale);
            await metricsCollector.updateCommandResult(event.id, 'success');
        } catch (err) {
            Logger.errorCatch('Command::mods', err);
            await metricsCollector.updateCommandResult(event.id, 'error');
            await queue.addToQueue(event.nick, "An error occurred while executing the mods command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
                await metricsCollector.close();
            } catch (e) {
                Logger.errorCatch('Command::mods::disconnect', e);
            }
        }
    }
};
