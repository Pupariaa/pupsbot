const { getUser } = require('../services/OsuApiV1');
const fork = require('child_process').fork;
const RedisStore = require('../services/RedisStore');
const Logger = require('../utils/Logger');
const MetricsCollector = require('../services/MetricsCollector');

module.exports = {
    name: 'o',
    async execute(event, args, queue) {
        const performe = new RedisStore();
        const metricsCollector = new MetricsCollector();
        await metricsCollector.init();
        try {
            await metricsCollector.createCommandEntry(event.id, 'o');
            await performe.markPending(event.id);
            const child = fork((__dirname, '..', 'workers/osu.js'));
            const user = await getUser(event.nick);
            await metricsCollector.recordStepDuration(event.id, 'get_user');

            // Register worker with global monitoring
            if (global.workerMonitor) {
                Logger.service(`COMMAND_O: Adding worker ${event.id} to WorkerMonitor`);
                global.workerMonitor.addWorker(
                    child,
                    event.id,
                    'osu',
                    user.id,
                    event.nick
                );
                Logger.service(`COMMAND_O: Worker ${event.id} added successfully`);
            } else {
                Logger.service('COMMAND_O: global.workerMonitor not available');
            }

            try {
                child.send({ event, user });
            } catch (error) {
                Logger.errorCatch('COMMAND_O_SEND', error);
                await queue.addToQueue(event.nick, "Worker communication error.", false, event.id, false);
                return;
            }

            child.on('message', async (msgFromWorker) => {
                if (msgFromWorker && msgFromWorker.username && msgFromWorker.response) {
                    await queue.addToQueue(
                        msgFromWorker.username,
                        msgFromWorker.response,
                        false,
                        msgFromWorker.id,
                        msgFromWorker.success
                    );
                    if (!global.temp.includes(msgFromWorker.username)) {

                        const responseMessage = user.locale === 'FR'
                            ? `Si tu le souhaite, je t'invite à donner ton retour constructif de Pupsbot ! Fait simplement !fb <retour>. Merci d'avance ♥`
                            : `If you wish, I invite you to give constructive feedback on Pupsbot! Simply !fb <feedback>. Thanks in advance ♥`;
                        // const responseMessage = user.locale === 'FR'
                        //     ? `Pupsbot est un bot très gourmand en ressources que je développe avec passion, mais les coûts de serveurs et de matériel restent inévitables [https://ko-fi.com/pupsbot Supporte le sur Ko-fi] Merci ♥`
                        //     : `Pupsbot is a resource-intensive bot I passionately maintain, but server and hardware costs remain unavoidable [https://ko-fi.com/pupsbot Support it on Ko-fi] Thanks u ♥ `;

                        await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
                        global.temp.push(msgFromWorker.username);

                    }
                    child.kill();
                }
            });
        } catch (e) {
            console.log(e);
            Logger.errorCatch('osu', e);
            await queue.addToQueue(event.nick, "An error occurred while executing the bm command.", false, event.id, false);
        }
    }
};
