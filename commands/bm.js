const { getUser } = require('../services/osuApi');
const fork = require('child_process').fork;
module.exports = {
    name: 'bm',
    async execute(event, args, queue) {
        child = fork((__dirname, '..', 'workers/bm.js'));
        let user = await getUser(event.nick);
        try {
            child.send({ event, user });
        } catch (e) {
            console.error(e)
        }
    }
};