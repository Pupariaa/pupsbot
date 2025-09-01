const { getUser } = require('../services/OsuApiV1');
const fork = require('child_process').fork;
const Performe = require('../services/Performe');
const Logger = require('../utils/Logger');

module.exports = {
    name: 'magic',
    async execute(event, args, queue) {
        const performe = new Performe();
        try {
            await performe.markPending(event.id);
            const child = fork((__dirname, '..', 'workers/magic.js'));
            const user = await getUser(event.nick);

            child.send({ event, user });

            child.on('message', async (msgFromWorker) => {
                await queue.addToQueue(
                    msgFromWorker.username,
                    msgFromWorker.response,
                    false,
                    msgFromWorker.id,
                    msgFromWorker.success
                );
            });
        } catch (e) {
            Logger.errorCatch('bm', e);
            await queue.addToQueue(event.nick, "An error occurred while executing the bm command.", false, event.id, false);
        }
    }
};
