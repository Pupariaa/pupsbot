function getUserErrorMessage(code, locale = 'FR') {
    const messages = {
        ERR_API_UNAVAILABLE: {
            FR: "Le service osu! semble indisponible. Réessaie dans quelques minutes.",
            EN: "The osu! API is currently unavailable. Please try again later."
        },
        ERR_DB_FAIL: {
            FR: "Une erreur est survenue lors de l'accès à la base de données.",
            EN: "An error occurred while accessing the database."
        },
        ERR_NO_BEATMAP: {
            FR: "Aucune beatmap ne correspond à ta demande.",
            EN: "No beatmap matches your request."
        },
        ERR_TIMEOUT: {
            FR: "Temps de traitement dépassé.",
            EN: "Processing timeout."
        },
        ERR_INVALID_MODS: {
            FR: "Les mods spécifiés sont invalides ou non supportés.",
            EN: "The provided mods are invalid or not supported."
        },
        ERR_TOO_MANY_REQUESTS: {
            FR: "Trop de requêtes. Merci de réessayer plus tard.",
            EN: "Too many requests. Please try again later."
        },
        ERR_WORKER_CRASH: {
            FR: "Une erreur interne est survenue.",
            EN: "An internal error occurred."
        },
        ERR_UNKNOWN: {
            FR: "Erreur inconnue.",
            EN: "Unknown error."
        }
    };

    return messages[code]?.[locale] || messages.ERR_UNKNOWN[locale];
}

module.exports = { getUserErrorMessage };