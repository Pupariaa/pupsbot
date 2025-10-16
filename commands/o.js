const fork = require('child_process').fork;
const RedisStore = require('../services/RedisStore');
const Logger = require('../utils/Logger');
const MetricsCollector = require('../services/MetricsCollector');

module.exports = {
    name: 'o',
    async execute(event, args, queue, lastRequests, user = null) {
        const performe = new RedisStore();
        const metricsCollector = new MetricsCollector();
        await metricsCollector.init();
        try {
            await metricsCollector.createCommandEntry(event.id, 'o');
            await performe.markPending(event.id);
            const child = fork((__dirname, '..', 'workers/osu.js'));
            if (!user) {
                user = await global.osuApiClient.getUser(event.nick);
            }
            await metricsCollector.recordStepDuration(event.id, 'get_user');

            if (global.workerMonitor) {
                global.workerMonitor.addWorker(
                    child,
                    event.id,
                    'osu',
                    user.id,
                    event.nick
                );
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
                    child.kill();
                    global.userRequest = global.userRequest.filter(user => user !== msgFromWorker.username);
                }
            });
        } catch (e) {
            Logger.errorCatch('Command O', e);
            Logger.errorCatch('osu', e);
            await queue.addToQueue(event.nick, "An error occurred while executing the bm command.", false, event.id, false);
        }
    }
};
