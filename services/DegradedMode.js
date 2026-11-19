const Logger = require('../utils/Logger');

function getParisDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
}

function isBeforeCutoff(until) {
    const now = getParisDate();
    const [h, m] = until.split(':').map(Number);
    const cutoff = new Date(now);
    cutoff.setHours(h, m || 0, 0, 0);
    return now < cutoff;
}

function isNoApiMode() {
    return process.env.NO_API === 'true' || global.noApiMode === true;
}

function isDegradedModeActive() {
    if (isNoApiMode()) return true;
    if (!global.degradedMode) return false;
    const until = process.env.DEGRADED_UNTIL || '15:00';
    return isBeforeCutoff(until);
}

function getDegradedMessage(locale) {
    if (locale === 'FR') {
        return "Un incident touche actuellement l’API d’osu!. Les commandes de Pupsbot qui en dépendent sont temporairement indisponibles. Réessaie dans un moment.";
    }
    if (locale === 'EN') {
        return "The osu! API is currently experiencing an outage. Pupsbot commands that rely on it are temporarily unavailable. Please try again in a bit.";
    }
    return "Un incident touche actuellement l’API d’osu! / The osu! API is currently experiencing an outage. Réessaie dans un moment / Please try again in a bit.";
}

function activateDegradedMode(reason) {
    global.degradedMode = true;
    Logger.service(`Degraded mode activated: ${reason}`);
}

function activateNoApiMode(reason) {
    global.noApiMode = true;
    Logger.service(`No-API mode activated: ${reason}`);
}

function shouldSkipBackend() {
    return global.degradedMode === true;
}

function shouldSkipApi() {
    return isNoApiMode();
}

module.exports = {
    isDegradedModeActive,
    isNoApiMode,
    getDegradedMessage,
    activateDegradedMode,
    activateNoApiMode,
    shouldSkipBackend,
    shouldSkipApi
};
