const { getUser } = require('../services/OsuApiV1');
const Thread2Database = require('../services/SQL');
const Performe = require('../services/Performe');
const Logger = require('../utils/Logger');

module.exports = {
    name: 'release',
    async execute(event, args, queue) {
        const performe = new Performe();
        const db = new Thread2Database();

        try {
            await performe.markPending(event.id);
            await db.connect();

            const u = await getUser(event.nick);
            const responseMessage = u.locale === 'FR' ?
                `-- V2.0.1 Mise à jour majeure de Pupsbot ! Qu'est ce qui a changé ? --
                - Support des mods ! Ajoute simplement les mods désiré après la commande. E.g: !bm hd dt. Par défaut, Pupsbot ne te donnera que des maps sans mods. Rajoute simplement un + dans la commande pour autoriser la découverte de maps avec des mods. Si tu ne l'as pas ajouté mais que tu as spécifié un ou des mods, uniquement les mods spécifiés seront pris en compte.
                - Meilleur précision de scores. Tu peux exiger au bot de se baser sur des scores plus précis. Rajoute simplement "precis x" en remplaçant le x par une valeur de 1 à 8.
                - Une base de donnée beaucoup plus vaste avec plus de 50 millions de scores de références.
                - L'ajout du "Rank Up Cible". Le Rank Up Cible c'est tout simplement le nombre de PP qu'il te faudra faire pour rank up. Il est également utilisé pour donner des maps qui te permettrons à coup sûr de rank up.
                -- V2.0.2 FixBug --
                - Bug fix
                - Anti Spam
                - Optimisations
                - Ajout du star rating
                - Ajout du mode "NM" pour avoir exclusivement des maps no mods
                `
                :
                `-- V2.0.1 Major update of Pupsbot! What has changed ? --
                - Support of mods! Simply add the desired mods after the command. E.g: ! bm hd dt. By default, Pupsbot will only give you maps without mods. Simply add a + in the command to allow the discovery of maps with mods. If you did not add it but specified one or more mods, only the specified mods will be taken into account.
                - Improved accuracy of scores. You can require the bot to base on more accurate scores. Simply add "precis x" by replacing the x with a value from 1 to 8.
                - A much larger database with more than 50 million reference scores.
                - The addition of the "Rank Up Cible". The Rank Up Cible is simply the number of PP you will need to rank up. It is also used to give maps that will allow you to rank up for sure.
                -- V2.0.2 FixBug --
                - Bug fix
                - Anti Spam
                - Optimizations
                - Add Star Rating
                - Addition of the "NM" mode to have exclusively maps no mods
                `;

            await queue.addToQueue(event.nick, responseMessage, false, event.id, true);
            await db.saveCommandHistory(event.id, event.message, responseMessage, u.id, event.nick, true, 0, u.locale);
        } catch (err) {
            Logger.errorCatch('Command::release', err);
            await queue.addToQueue(event.nick, "An error occurred while executing the release command.", false, event.id, false);
        } finally {
            try {
                await db.disconnect();
            } catch (e) {
                Logger.errorCatch('Command::release::disconnect', e);
            }
        }
    }
};
