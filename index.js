require('dotenv').config();
const OsuIRCClient = require("./services/IRC");
const IRCQueueManager = require("./services/Queue");
const CommandManager = require('./services/Commands');
const Performe = require('./services/Performe');
const calculatePPWithMods = require('./utils/osu/PPCalculator');
const generateId = require('./utils/generateId');
const { getUser } = require('./services/osuApi');
const lastRequests = {};
const ircBot = new OsuIRCClient({
    username: process.env.IRC_USERNAME,
    password: process.env.IRC_PASSWORD,
    channel: "#osu"
});

const queue = new IRCQueueManager(
    (target, message) => ircBot.sendMessage(message, target),
    {
        maxConcurrent: 4,
        ratePerSecond: 4,
        maxRetries: 2,
        enableLogs: true
    }
);
const performe = new Performe();
performe.init();


const commandManager = new CommandManager();
ircBot.connect();


ircBot.onAction(async ({ target, message, nick }) => {
    const t = performe.startTimer();
    if (target !== process.env.IRC_USERNAME) return;

    const [, beatmapId] = message.match(/#\/(\d+)/) || [];
    if (!beatmapId) return;

    const user = await getUser(nick);
    const isFR = user.locale === 'FR';
    const result = await calculatePPWithMods(beatmapId);
    if (result.error) {
        await queue.addToQueue(nick, result.error);
        performe.logCommand(await t.stop('CMDNP'), 'CMDNP')
        return;
    }
    const summary = result.NoMod;

    lastRequests[nick] = {
        beatmapId,
        timestamp: Date.now(),
        results: result
    };

    const out = `${isFR ? 'PP (FC/NM) pour' : 'PP (FC/NM) for'} (100 %, 98 %, 95 %, 90 %) : ${summary['100']} / ${summary['98']} / ${summary['95']} / ${summary['90']} | ${isFR ? '!mods pour plus de détails' : '!mods for more details'}`;
    performe.logCommand(await t.stop('CMDNP'), 'CMDNP')
    await queue.addToQueue(nick, out);
});

ircBot.onMessage(async (event) => {
    if (event.target.toLowerCase() == process.env.IRC_USERNAME.toLowerCase()) {
        const msg = event.message.trim();
        if (!msg.startsWith('!')) return;
        event.id = id = generateId();
        await commandManager.handleMessage(event, queue, lastRequests);

        child.on('message', async (msgFromWorker) => {
            if (msgFromWorker && msgFromWorker.username && msgFromWorker.response) {

                await queue.addToQueue(msgFromWorker.username, msgFromWorker.response);
            }
        })





        // const axios = require('axios');
        // const { Sequelize } = require('sequelize');
        // const { generateId } = require('./utils/generateId');
        // const { SendErrorInternal } = require('./utils/messages');
        // const CommandHistory = require('./models/CommandHistory');
        // const suggested_beatmap = require('./models/SuggestedBeatmap');
        // const { fork } = require('child_process');
        // const winston = require('winston');
        // const ojsama = require('ojsama');
        // const SuggestedBeatmap = require('./models/SuggestedBeatmap');


        // if (msg.startsWith('!bm') || msg.startsWith('!test') || msg.startsWith('!')) {

        //     console.log('Commande de ' + event.nick + ' : ' + event.message);
        //     const startTime = Date.now();
        //     const id = generateId()
        //     const { instanceKey, threadKey } = await getAvailableInstance('abc123');

        //     await CommandHistory.upsert({
        //         command_id: id,
        //         command_input: event.message.trim(),
        //         response: null,
        //         user_id: null,
        //         username: event.nick,
        //         used_thread: threadKey,
        //         Date: new Date(),
        //         Success: false,
        //         elapsed_time: null
        //     });


        //     let user = event.nick;
        //     const commandParts = msg.split(' ');
        //     const command = commandParts[0];
        //     if (!userQueues[user]) {
        //         userQueues[user] = [];
        //     }
        //     userQueues[user].push({ command, timestamp: startTime });
        //     let child;
        //     let userInfo;
        //     let responseMessage = '';
        //     let processingDelay = 0;
        //     const userInfoUrl = `https://osu.ppy.sh/api/get_user?k=${process.env.OSU_API_KEY}&u=${encodeURIComponent(user)}&type=string&m=0`;
        //     const userInfoResp = await axios.get(userInfoUrl);
        //     userInfo = userInfoResp.data;
        //     const history = await CommandHistory.findAll({
        //         where: { user_id: userInfo[0].user_id }
        //     });

        //     const sug = await SuggestedBeatmap.findAll({
        //         where: { user_id: userInfo[0].user_id }
        //     });


        // if (command === '!bm' || command === '!bm+') {
        // if (history.length === 0) {
        //     const endTime = Date.now();
        //     processingDelay = endTime - startTime;
        //     const elapsedSeconds = (processingDelay / 1000).toFixed(2);
        //     if (userInfo[0].country === 'FR') {
        //         client.say(user, `Hey ! Merci d'être fidèle à Pupsbot ! Je reviens beaucoup plus fort. Je t'invite à faire !release pour voir ce qui a changé !`);
        //     } else {
        //         client.say(user, `Hey! Thanks for being faithful to Pupsbot ! I come back much stronger. I invite you to do !release to see what has changed!`);
        //     }

        //     await CommandHistory.update(
        //         { response: 'Welcom to v2 farbot', Success: false, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
        //         { where: { command_id: id } }
        //     );

        // }

        // if (maintenance) {
        //     const endTime = Date.now();
        //     processingDelay = endTime - startTime;
        //     const elapsedSeconds = (processingDelay / 1000).toFixed(2);
        //     if (userInfo[0].country === 'FR') {
        //         client.say(user, `Désolé, je suis en maintenance, je reviens très vite pour être encore plus fort !`);
        //     } else {
        //         client.say(user, `Sorry, I’m in maintenance, I’ll be back soon to be even stronger!`);
        //     }

        //     await CommandHistory.update(
        //         { response: 'Maintenance', Success: false, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
        //         { where: { command_id: id } }
        //     );
        //     return;
        // }
        // child = fork('./redis_worker.js');

        // try {

        //     if (userInfo.length === 0) {
        //         const endTime = Date.now();
        //         processingDelay = endTime - startTime;
        //         const elapsedSeconds = (processingDelay / 1000).toFixed(2);
        //         await CommandHistory.update(
        //             { response: 'User Not found', Success: false, elapsed_time: elapsedSeconds },
        //             { where: { command_id: id } }
        //         );
        //         throw new Error('Utilisateur non trouvé.');
        //     }
        //     if (userInfo[0].country === 'FR') {
        //         client.say(user, `Attends je réfléchis..`);
        //     } else {
        //         client.say(user, `Give me time to think.`);
        //     }


        //     child.send({ user, userInfo, command, msg, id, instanceKey, sug });
        // } catch (e) {
        //     const errMsg = e instanceof Error ? e.stack || e.message : String(e)
        //     const msg = SendErrorInternal(userInfo[0].country, id);
        //     client.say(user, msg);
        //     const endTime = Date.now();
        //     processingDelay = endTime - startTime;
        //     const elapsedSeconds = (processingDelay / 1000).toFixed(2);
        //     await CommandHistory.update(
        //         { response: errMsg, Success: false, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
        //         { where: { command_id: id } }
        //     );

        //     return;
        // }

        // child.on('message', async (msgFromWorker) => {
        //     if (msgFromWorker && msgFromWorker.username && msgFromWorker.response) {
        //         const endTime = Date.now();
        //         processingDelay = endTime - startTime;
        //         const elapsedSeconds = (processingDelay / 1000).toFixed(2);
        //         responseMessage = msgFromWorker.response;
        //         client.say(msgFromWorker.username, responseMessage);
        //         // client.say('Puparia', responseMessage);


        //         await suggested_beatmap.upsert({
        //             user_id: msgFromWorker.userId,
        //             beatmap_id: msgFromWorker.beatmapId,
        //             Date: new Date(),

        //         });



        //         await CommandHistory.update(
        //             { response: responseMessage, Success: true, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
        //             { where: { command_id: id } }
        //         );
        //         if (userQueues[msgFromWorker.username]) {
        //             userQueues[msgFromWorker.username].shift();
        //             if (userQueues[msgFromWorker.username].length === 0) {
        //                 delete userQueues[msgFromWorker.username];
        //             }
        //         }
        //     }
        //     child.kill();
        // });

        // child.on('error', async (err) => {
        //     winston.error('Erreur worker:', err);

        //     const msg = SendErrorInternal(userInfo[0].country, id);
        //     client.say(user, msg);
        //     const endTime = Date.now();
        //     processingDelay = endTime - startTime;
        //     const elapsedSeconds = (processingDelay / 1000).toFixed(2);
        //     await CommandHistory.update(
        //         { response: err, Success: false, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
        //         { where: { command_id: id } }
        //     );

        //     if (userQueues[user]) {
        //         userQueues[user].shift();
        //         if (userQueues[user].length === 0) {
        //             delete userQueues[user];
        //         }
        //     }
        // });
    }


    //     } else if (msg == "!help" || msg == "!HELP" || msg == "!aide" || msg == "!AIDE") {
    //         if (userInfo[0].country === 'FR') {
    //             client.say(user, `Commandes disponible: !bm [Donne une beatmap non jouée (ou jouée il y a longtemps/pas dans ton top rank) mais jouée par quelqu'un ton rang] <mods> | !info[Informations du bot] /np [Donne les pp gains de la map ranked envoyée] | !help [Aide] | !support [Supporter le projet] | !release [Informations sur la mise à jour]`);
    //         } else {
    //             client.say(user, `Orders available: ! bm [Give a beatmap not played (or played a long time ago/not in your top rank) but played by someone your rank] <mods> | ! info[Bot information] /np [Give the pp earnings of the ranked map sent] | ! help [Help] | ! support [Support the project] | ! release [Update information]`);
    //         }

    //         const endTime = Date.now();
    //         processingDelay = endTime - startTime;
    //         const elapsedSeconds = (processingDelay / 1000).toFixed(2);
    //         await CommandHistory.update(
    //             { response: 'help message', Success: true, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
    //             { where: { command_id: id } }
    //         );
    //     } else if (msg == "!info" || msg == "!INFO") {
    //         if (userInfo[0].country === 'FR') {
    //             client.say(user, `Pupsbot V2 (Anciennement Puparia V1) est un bot qui vous donne des beatmaps parfaites pour gagner des PP. Elles sont choisies parmi les maps jamais jouées ou absentes de votre top 100, mais présentes dans le top 100 d'autres joueurs proches de votre niveau. Plus de 50M de scores sont stockées en Redis (ultra rapide), avec compatibilité HD/HR/DT/NF/EZ, et un algorithme qui calcule votre target PP pour maximiser vos gains. Le /np reste dispo pour estimer vos gains PP avec ou sans mods. Pour soutenir le projet, voici [https://ko-fi.com/bellafiora le lien kofi] Thanks-u ♥`);
    //         } else {
    //             client.say(user, `Pupsbot V2 (Formerly Puparia V1) is a bot that gives you perfect beatmaps to earn PP. They are chosen from maps never played or absent from your top 100, but present in the top 100 of other players close to your level. More than 50M of scores are stored in Redis (ultra fast), with HD/HR/DT/NF/EZ compatibility, and an algorithm that calculates your target PP to maximize your gains. The /np remains available to estimate your PP earnings with or without mods. To support the project, here is [https://ko-fi.com/bellafiora le lien kofi] Thanks-u ♥`);
    //         }

    //         const endTime = Date.now();
    //         processingDelay = endTime - startTime;
    //         const elapsedSeconds = (processingDelay / 1000).toFixed(2);
    //         await CommandHistory.update(
    //             { response: 'info message', Success: true, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
    //             { where: { command_id: id } }
    //         );
    //     } else if (msg == "!support" || msg == "!SUPPORT" || msg == "!supporter" || msg == "!SUPPORTER") {
    //         if (userInfo[0].country === 'FR') {
    //             client.say(user, `Pour soutenir le projet, voici [https://ko-fi.com/bellafiora le lien kofi] :) Merci ♥`);
    //         } else {
    //             client.say(user, `To support the project, here is [https://ko-fi.com/bellafiora the kofi link] :) Thanks-u ♥`);
    //         }
    //         const endTime = Date.now();
    //         processingDelay = endTime - startTime;
    //         const elapsedSeconds = (processingDelay / 1000).toFixed(2);
    //         await CommandHistory.update(
    //             { response: 'Support message', Success: true, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
    //             { where: { command_id: id } }
    //         );

    //     } else if (msg == "!mods") {
    //         const req = lastRequests[user];
    //         if (!req) {

    //             client.say(event.nick, "Aucune map enregistrée pour toi. Fais d'abord /np sur une map ranked.");
    //             const endTime = Date.now();
    //             processingDelay = endTime - startTime;
    //             const elapsedSeconds = (processingDelay / 1000).toFixed(2);
    //             await CommandHistory.update(
    //                 { response: 'No Request', Success: false, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
    //                 { where: { command_id: id } }
    //             );
    //             return;
    //         }

    //         const elapsed = Date.now() - req.timestamp;
    //         if (elapsed > 2 * 60 * 60 * 1000) {
    //             delete lastRequests[user];
    //             client.say(event.nick, "La demande a expiré. Fais d'abord /np sur une map ranked.");

    //             const endTime = Date.now();
    //             processingDelay = endTime - startTime;
    //             const elapsedSeconds = (processingDelay / 1000).toFixed(2);
    //             await CommandHistory.update(
    //                 { response: 'Expired request', Success: false, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
    //                 { where: { command_id: id } }
    //             );

    //             if (userQueues[user]) {
    //                 userQueues[user].shift();
    //                 if (userQueues[user].length === 0) {
    //                     delete userQueues[user];
    //                 }
    //             }
    //             return;
    //         }
    //         const r = req.results;
    //         const msgMods =
    //             "PP Gain (FC) pour 100% / 98% / 95% / 90% :\n\n" +
    //             "HD:   " + r.HD['100'] + " / " + r.HD['98'] + " / " + r.HD['95'] + " / " + r.HD['90'] + "\n" +
    //             "HR:   " + r.HR['100'] + " / " + r.HR['98'] + " / " + r.HR['95'] + " / " + r.HR['90'] + "\n" +
    //             "DT:   " + r.DT['100'] + " / " + r.DT['98'] + " / " + r.DT['95'] + " / " + r.DT['90'] + "\n" +
    //             "DTHD: " + r.DTHD['100'] + " / " + r.DTHD['98'] + " / " + r.DTHD['95'] + " / " + r.DTHD['90'] + "\n" +
    //             "DTHR: " + r.DTHR['100'] + " / " + r.DTHR['98'] + " / " + r.DTHR['95'] + " / " + r.DTHR['90'] + "\n" +
    //             "HDHR: " + r.HDHR['100'] + " / " + r.HDHR['98'] + " / " + r.HDHR['95'] + " / " + r.HDHR['90'];

    //         client.say(event.nick, msgMods);

    //         delete lastRequests[user];

    //         const endTime = Date.now();
    //         processingDelay = endTime - startTime;
    //         const elapsedSeconds = (processingDelay / 1000).toFixed(2);
    //         await CommandHistory.update(
    //             { response: msgMods, Success: true, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
    //             { where: { command_id: id } }
    //         );

    //         if (userQueues[user]) {
    //             userQueues[user].shift();
    //             if (userQueues[user].length === 0) {
    //                 delete userQueues[user];
    //             }
    //         }



    //     } else if (msg == '!release') {
    //         if (userInfo[0].country === 'FR') {
    //             client.say(user, `-- V2.0.1 Mise à jour majeure de Pupsbot ! Qu'est ce qui a changé ? --`);
    //             client.say(user, `- Support des mods ! Ajoute simplement les mods désiré après la commande. E.g: !bm hd dt. Par défaut, Pupsbot ne te donnera que des maps sans mods. Rajoute simplement un + dans la commande pour autoriser la découverte de maps avec des mods. Si tu ne l'as pas ajouté mais que tu as spécifié un ou des mods, uniquement les mods spécifiés seront pris en compte.`);
    //             client.say(user, `- Meilleur précision de scores. Tu peux exiger au bot de se baser sur des scores plus précis. Rajoute simplement "precis x" en remplaçant le x par une valeur de 1 à 8.`);
    //             client.say(user, `- Une base de donnée beaucoup plus vaste avec plus de 50 millions de scores de références.`);
    //             client.say(user, `- L'ajout du "Rank Up Cible". Le Rank Up Cible c'est tout simplement le nombre de PP qu'il te faudra faire pour rank up. Il est également utilisé pour donner des maps qui te permettrons à coup sûr de rank up. `);

    //         } else {
    //             client.say(user, `-- V2.0.1 Major update of Pupsbot! What has changed ? --`);
    //             client.say(user, `- Support of mods! Simply add the desired mods after the command. E.g: ! bm hd dt. By default, Pupsbot will only give you maps without mods. Simply add a + in the command to allow the discovery of maps with mods. If you did not add it but specified one or more mods, only the specified mods will be taken into account.`);
    //             client.say(user, `- Improved accuracy of scores. You can require the bot to base on more accurate scores. Simply add "precis x" by replacing the x with a value from 1 to 8.`);
    //             client.say(user, `- A much larger database with more than 50 million reference scores.`);
    //             client.say(user, `- The addition of the "Rank Up Cible". The Rank Up Cible is simply the number of PP you will need to rank up. It is also used to give maps that will allow you to rank up for sure. `);
    //         }

    //         const endTime = Date.now();
    //         processingDelay = endTime - startTime;
    //         const elapsedSeconds = (processingDelay / 1000).toFixed(2);
    //         await CommandHistory.update(
    //             { response: 'release message', Success: true, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
    //             { where: { command_id: id } }
    //         );

    //         if (userQueues[user]) {
    //             userQueues[user].shift();
    //             if (userQueues[user].length === 0) {
    //                 delete userQueues[user];
    //             }
    //         }
    //     } else if (msg.startsWith('!')) {

    //         if (userInfo[0].country === 'FR') {
    //             client.say(user, "Je n'ai pas compris ta commande. !help ou !info");
    //         } else {
    //             client.say(user, "Sorry, I don’t know this command. !help or !info");
    //         }



    //         const endTime = Date.now();
    //         processingDelay = endTime - startTime;
    //         const elapsedSeconds = (processingDelay / 1000).toFixed(2);
    //         await CommandHistory.update(
    //             { response: 'Unknown Command', Success: false, elapsed_time: elapsedSeconds, user_id: userInfo[0].user_id },
    //             { where: { command_id: id } }
    //         );

    //         if (userQueues[user]) {
    //             userQueues[user].shift();
    //             if (userQueues[user].length === 0) {
    //                 delete userQueues[user];
    //             }
    //         }


    //     }
    // }

});



process.on('uncaughtException', (err) => {
    console.error(err)
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
    console.error(promise);
});