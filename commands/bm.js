const { getUser } = require('../services/osuApi');
const fork = require('child_process').fork;
module.exports = {
    name: 'bm',
    async execute(event, args, queue) {
        child = fork((__dirname, '..', 'workers/bm.js'));
        let user = await getUser(event.nick);
        try {
            user.locale == 'FR' ? await queue.addToQueue(event.nick, `Attends je réfléchis..`) : await queue.addToQueue(event.nick, `Give me time to think.`);
            child.send({ event, user });
        } catch (e) {
            console.error(e)
        }
    }
};