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
                `-- V2.0.3 Nouvelle mise à jour Pupsbot ! --
                - Nouveaux filtres avancés : pp:XXX et bpm:XXX pour des recommendations ultra-précises
                - Exemple: !o HD pp:200 bpm:180 pour des maps HD donnant ~200pp avec ~180 BPM
                - Système de tracking des scores réparé (était cassé depuis 1 mois+)
                - Intégration osu! API V2 pour de meilleures performances
                - Dashboard de monitoring disponible sur remote.pupsweb.cc
                - Optimisations Redis pour le filtrage BPM (plus rapide)
                -- Historique V2.0.1/V2.0.2 --
                - Support complet des mods avec syntaxe flexible
                - Précision ajustable des scores (precis 1-8)
                - Base de données 50M+ scores
                - Calcul automatique du PP cible pour rank up
                - Anti-spam et optimisations diverses
                `
                :
                `-- V2.0.3 New Pupsbot Update! --
                - New advanced filters: pp:XXX and bpm:XXX for ultra-precise recommendations
                - Example: !o HD pp:200 bpm:180 for HD maps giving ~200pp with ~180 BPM
                - Fixed score tracking system (was broken for 1+ month)
                - osu! API V2 integration for better performance
                - Monitoring dashboard available at remote.pupsweb.cc
                - Redis optimizations for BPM filtering (faster)
                -- V2.0.1/V2.0.2 History --
                - Full mod support with flexible syntax
                - Adjustable score precision (precis 1-8)
                - 50M+ scores database
                - Automatic target PP calculation for rank up
                - Anti-spam and various optimizations
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
