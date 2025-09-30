const { formatTime } = require('./functions');
const osu_utils = require('osu-utils');
const osuUtils = new osu_utils();

async function buildBeatmapMessage(locale, selected, beatmapInfo, targetPP, unknownTokens, unsupportedMods, osuApiClient = null) {
    const realSR = await getStarRating(selected, beatmapInfo, osuApiClient);
    const moddedStats = getModdedStats(selected);
    const messageComponents = buildMessageComponents(locale, selected, beatmapInfo, targetPP, realSR, moddedStats);
    const infoPrefix = buildInfoPrefix(locale, unknownTokens, unsupportedMods);
    const messageBody = buildMessageBody(locale, selected, messageComponents, moddedStats);
    const beatmapData = buildBeatmapData(selected, beatmapInfo, realSR, moddedStats);

    return {
        message: `${infoPrefix}${messageBody}`,
        beatmap: beatmapData
    };
}

async function getStarRating(selected, beatmapInfo, osuApiClient) {
    try {
        const client = osuApiClient || global.osuApiClient;
        if (client) {
            const srData = await client.getBeatmapStarRating(selected.beatmap_id, selected.mods, 'osu');
            return srData.star_rating;
        } else {
            console.warn('OsuApiClient not initialized');
            return parseFloat(beatmapInfo.difficultyrating) || parseFloat(selected.stars) || 0;
        }
    } catch (error) {
        return parseFloat(beatmapInfo.difficultyrating) || parseFloat(selected.stars) || 0;
    }
}

function getModdedStats(selected) {
    return osuUtils.ConvertStatsWithMods({
        cs: selected.cs,
        od: selected.od,
        hp: selected.hp,
        ar: selected.ar,
        bpm: selected.bpm,
        length: selected.length
    }, 'osu', selected.mods);
}

function buildMessageComponents(locale, selected, beatmapInfo, targetPP, realSR, { cs, od, hp, ar, bpm, length }) {
    return {
        duration: formatTime(length),
        linkScore: `[https://osu.ppy.sh/scores/osu/${selected.scoreId} ${locale === 'FR' ? 'ce score' : 'that score'}]`,
        linkBeatmap: `[https://osu.ppy.sh/b/${selected.beatmap_id} ${selected.title} - ${selected.artist}]`,
        ppText: `${parseFloat(selected.pp).toFixed(0)} PP`,
        stars: `${parseFloat(realSR).toFixed(2)} ★`,
        stats: `AR${ar} CS${cs} OD${od} HP${hp}`,
        target: `${targetPP || '?'}PP`
    };
}

function buildInfoPrefix(locale, unknownTokens, unsupportedMods) {
    const hasUnsupported = unsupportedMods?.length > 0;
    const hasUnknown = unknownTokens?.length > 0;

    if (!hasUnsupported && !hasUnknown) return '';

    if (locale === 'FR') {
        return buildFrenchInfoPrefix(hasUnsupported, hasUnknown, unsupportedMods, unknownTokens);
    } else {
        return buildEnglishInfoPrefix(hasUnsupported, hasUnknown, unsupportedMods, unknownTokens);
    }
}

function buildFrenchInfoPrefix(hasUnsupported, hasUnknown, unsupportedMods, unknownTokens) {
    const parts = [];

    if (hasUnsupported) {
        parts.push(`Le${unsupportedMods.length > 1 ? 's mods suivants ne sont pas pris en charge' : ' mod suivant n\'est pas pris en charge'} : ${unsupportedMods.join(', ')}`);
    }

    if (hasUnknown) {
        parts.push(`${hasUnsupported ? 'et ' : ''}je n\'ai pas reconnu ${unknownTokens.length > 1 ? 'les tokens suivants' : 'le token suivant'} : ${unknownTokens.join(', ')}`);
    }

    return `${parts.join(', ')}. ${hasUnsupported && hasUnknown ? 'Aucun d\'eux' : 'Il' + (hasUnsupported || unknownTokens.length > 1 ? 's' : '')} ne sera pris en compte.\n`;
}

function buildEnglishInfoPrefix(hasUnsupported, hasUnknown, unsupportedMods, unknownTokens) {
    const parts = [];

    if (hasUnsupported) {
        parts.push(`The following mod${unsupportedMods.length > 1 ? 's are' : ' is'} not supported: ${unsupportedMods.join(', ')}`);
    }

    if (hasUnknown) {
        parts.push(`${hasUnsupported ? 'and ' : ''}I didn't recognize ${unknownTokens.length > 1 ? 'these tokens' : 'this token'}: ${unknownTokens.join(', ')}`);
    }

    return `${parts.join(', ')}. ${hasUnsupported && hasUnknown ? 'None of them' : (hasUnsupported || unknownTokens.length > 1 ? 'They' : 'It')} won't be taken into account.\n`;
}

function buildMessageBody(locale, selected, { duration, linkScore, linkBeatmap, ppText, stars, stats, target }, { cs, od, hp, ar }) {
    const modsString = osuUtils.ModsIntToString(selected.mods);

    if (locale === 'FR') {
        return `J\'ai trouvé cette beatmap que tu n\'as probablement pas faite, d\'après ${linkScore} ! ↪ ${linkBeatmap} (${selected.version}) ${modsString} | Estimation du gain de PP : ${ppText} | Durée : ${duration} | ${stars} | ${stats} | Rankup cible ${target}`;
    } else {
        return `I found this beatmap that you probably haven't played, based on ${linkScore} ! ↪ ${linkBeatmap} (${selected.version}) ${modsString} | Estimate of PP gain: ${ppText} | Duration: ${duration} | ${stars} | ${stats} | Target rankup ${target}`;
    }
}

function buildBeatmapData(selected, beatmapInfo, realSR, { cs, od, hp, ar, bpm, length }) {
    return {
        beatmapId: selected.beatmap_id ?? null,
        beatmapsetId: beatmapInfo.beatmapset_id ?? null,
        title: selected.title ?? null,
        author: selected.artist ?? null,
        mapper: beatmapInfo.creator ? beatmapInfo.creator : beatmapInfo.beatmapset.creator ?? null,
        diffName: selected.diff_name ?? selected.version ?? null,
        length: selected.length ?? null,
        cs: selected.cs ?? null,
        od: selected.od ?? null,
        hp: selected.hp ?? null,
        sr: parseFloat(beatmapInfo.difficulty_rating || beatmapInfo.difficultyrating) ?? null,
        ar: selected.ar ?? null,
        bpm: selected.bpm ?? null,
        cLength: length ?? null,
        cCs: cs ?? null,
        cOd: od ?? null,
        cHp: hp ?? null,
        cSr: realSR ?? null,
        cAr: ar ?? null,
        cBpm: bpm ?? null,
        mods: selected.mods ?? null
    };
}

function buildNotFoundMessage(locale) {
    return locale === 'FR'
        ? `Je suis désolé mais je n\'ai pas trouvé de beatmap avec ces critères.`
        : `I'm sorry but I couldn't find a beatmap with these criteria.`;
}

function buildInternalError(locale, id) {
    return locale === 'FR'
        ? `Quelque chose s\'est mal passé.. Si cela se reproduit, merci de me contacter sur Discord "Puparia" avec ce code: ${id}`
        : `Something went wrong. If this happens again, please contact me on Discord "Puparia" with this code: ${id}`;
}

module.exports = {
    SendBeatmapMessage: buildBeatmapMessage,
    SendNotFoundBeatmapMessage: buildNotFoundMessage,
    SendErrorInternal: buildInternalError
};
