const { getUser } = require('../services/OsuApiV1');
const Thread2Database = require('../services/SQL');
const Performe = require('../services/Performe');
const Logger = require('../utils/Logger');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'version',
    async execute(event, args, queue) {
        const performe = new Performe();
        const db = new Thread2Database();

        try {
            await performe.markPending(event.id);
            await db.connect();

            const u = await getUser(event.nick);

            const pkgPath = path.join(__dirname, '..', 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const version = pkg.version || 'unknown';
            const buildDate = pkg.date || 'unknown';
            const link = `https://github.com/Pupariaa/pupsbot/tree/v${version}`;

            const responseMessage = u.locale === 'FR'
                ? `Version de Pupsbot : ${version}\n📅 Date de build : ${buildDate}\n🔗 ${link}`
                : `Pupsbot version: ${version}\n📅 Build date: ${buildDate}\n🔗 ${link}`;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
        } catch (err) {
            Logger.errorCatch('Command::version', err);
            await queue.addToQueue(event.nick, "An error occurred while executing the version command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
            } catch (e) {
                Logger.errorCatch('Command::version::disconnect', e);
            }
        }
    }
};
