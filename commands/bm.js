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
                    // if (!global.temp.includes(msgFromWorker.username)) {
                    if (true) {


                        // const responseMessage = user.locale === 'FR'
                        //     ? `Si tu le souhaite, je t'invite à donner ton retour constructif de Pupsbot ! Fait simplement !fb <retour>. Merci d'avance ♥`
                        //     : `If you wish, I invite you to give constructive feedback on Pupsbot! Simply !fb <feedback>. Thanks in advance ♥`;
                        // const responseMessage = user.locale === 'FR'
                        //     ? `Pupsbot est un bot très gourmand en ressources que je développe avec passion, mais les coûts de serveurs et de matériel restent inévitables [https://ko-fi.com/pupsbot Supporte le sur Ko-fi] Merci ♥`
                        //     : `Pupsbot is a resource-intensive bot I passionately maintain, but server and hardware costs remain unavoidable [https://ko-fi.com/pupsbot Support it on Ko-fi] Thanks u ♥ `;

                        const responseMessage = user.locale === 'FR'
                            ? `La commande !bm est obsolète. Utilise !o à la place — elle devient la norme pour osu! (multi-mode en approche).`
                            : `The !bm command is deprecated. Please use !o instead — it's the new standard for osu! beatmap queries (multi-mode incoming).`;

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
