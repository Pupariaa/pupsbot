const { getUser } = require('../services/OsuApiV1');
const fork = require('child_process').fork;
const Performe = require('../services/Performe');
const Logger = require('../utils/Logger');

function getMaintenanceMessage(countryCode) {
    const upperCode = countryCode.toUpperCase();
    const fallbackTimeZones = {
        FR: 'Europe/Paris',
        EN: 'Europe/London',
        GB: 'Europe/London',
        US: 'America/New_York',
        ES: 'Europe/Madrid',
        DE: 'Europe/Berlin',
        IT: 'Europe/Rome',
        JP: 'Asia/Tokyo',
        CN: 'Asia/Shanghai',
        BR: 'America/Sao_Paulo',
        RU: 'Europe/Moscow'
    };

    const timeZone = fallbackTimeZones[upperCode] || 'UTC';

    const start = new Date(Date.UTC(2025, 7, 5, 1, 0, 0));
    const end = new Date(Date.UTC(2025, 7, 5, 3, 0, 0));

    const formatterTime = new Intl.DateTimeFormat(upperCode, {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const formatterDay = new Intl.DateTimeFormat(upperCode, {
        timeZone,
        day: 'numeric'
    });

    const formatterMonth = new Intl.DateTimeFormat(upperCode, {
        timeZone,
        month: 'long'
    });

    const startStr = formatterTime.format(start);
    const endStr = formatterTime.format(end);
    const day = formatterDay.format(start);
    const month = formatterMonth.format(start);

    if (upperCode === 'FR') {
        return `Note importante : Pour raison de maintenance, Pupsbot ne sera pas disponible de ${startStr} à ${endStr} le ${day} ${month} 2025.`;
    } else {
        return `Important note: Due to maintenance, Pupsbot will be unavailable from ${startStr} to ${endStr} on ${month} ${day}, 2025.`;
    }
}

module.exports = {
    name: 'o',
    async execute(event, args, queue) {
        const performe = new Performe();
        try {
            await performe.markPending(event.id);
            const child = fork((__dirname, '..', 'workers/osu.js'));
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
                    console.log(getMaintenanceMessage(user.locale))
                    if (!global.temp.includes(msgFromWorker.username)) {

                        // const responseMessage = user.locale === 'FR'
                        //     ? `Si tu le souhaite, je t'invite à donner ton retour constructif de Pupsbot ! Fait simplement !fb <retour>. Merci d'avance ♥`
                        //     : `If you wish, I invite you to give constructive feedback on Pupsbot! Simply !fb <feedback>. Thanks in advance ♥`;
                        const responseMessage = user.locale === 'FR'
                            ? `Pupsbot est un bot très gourmand en ressources que je développe avec passion, mais les coûts de serveurs et de matériel restent inévitables [https://ko-fi.com/pupsbot Supporte le sur Ko-fi] Merci ♥`
                            : `Pupsbot is a resource-intensive bot I passionately maintain, but server and hardware costs remain unavoidable [https://ko-fi.com/pupsbot Support it on Ko-fi] Thanks u ♥ `;

                        await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
                        global.temp.push(msgFromWorker.username);

                    }
                    child.kill();
                }
            });
        } catch (e) {
            Logger.errorCatch('osu', e);
            await queue.addToQueue(event.nick, "An error occurred while executing the bm command.", false, event.id, false);
        }
    }
};
