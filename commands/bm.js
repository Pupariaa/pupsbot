const { getUser } = require('../services/OsuApiV1');
const fork = require('child_process').fork;
const Performe = require('../services/Performe');
const Logger = require('../utils/Logger');

module.exports = {
    name: 'bm',
    async execute(event, args, queue) {
        const performe = new Performe();
        try {
            await performe.markPending(event.id);
            const child = fork((__dirname, '..', 'workers/bm.js'));
            const user = await getUser(event.nick);

            child.send({ event, user });

            child.on('message', async (msgFromWorker) => {
                if (msgFromWorker && msgFromWorker.username && msgFromWorker.response) {
                    await queue.addToQueue(
                        msgFromWorker.username,
                        msgFromWorker.response,
                        false,
                        msgFromWorker.id,
                        msgFromWorker.success
                    );
                    if (!global.temp.includes(msgFromWorker.username) && process.env.SUGGEST_FEEDBACK === 'true') {

                        const responseMessage = user.locale === 'FR'
                            ? `Si tu le souhaite, je t'invite à donner ton retour constructif de Pupsbot ! Fait simplement !fb <retour>. Merci d'avance ♥`
                            : `If you wish, I invite you to give constructive feedback on Pupsbot! Simply !fb <feedback>. Thanks in advance ♥`;

                        await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
                        global.temp.push(msgFromWorker.username);

                    }
                    child.kill();
                }
            });
        } catch (e) {
            Logger.errorCatch('bm', e);
            await queue.addToQueue(event.nick, "An error occurred while executing the bm command.", false, event.id, false);
        }
    }
};
