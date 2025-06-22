const { getUser } = require('../services/OsuApiV1');
const fork = require('child_process').fork;
const Performe = require('../services/Performe');
module.exports = {
    name: 'bm',
    async execute(event, args, queue) {
        const performe = new Performe();
        await performe.markPending(event.id);
        child = fork((__dirname, '..', 'workers/bm.js'));
        let user = await getUser(event.nick);
        try {
            child.send({ event, user });
            child.on('message', async (msgFromWorker) => {
                if (msgFromWorker && msgFromWorker.username && msgFromWorker.response) {
                    await queue.addToQueue(msgFromWorker.username, msgFromWorker.response);
                    await performe.markResolved(msgFromWorker.uid);
                }
            })
        } catch (e) {
            console.error(e)
        }
    }
};