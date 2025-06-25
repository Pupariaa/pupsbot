const { formatTime } = require('./functions');
const osu_utils = require('osu-utils');
const osuUtils = new osu_utils();

function buildBeatmapMessage(locale, selected, beatmapInfo, targetPP, unknownTokens, unsupportedMods) {
    const { cs, od, hp, ar, bpm, length } = osuUtils.ConvertStatsWithMods({
        cs: selected.cs,
        od: selected.od,
        hp: selected.hp,
        ar: selected.ar,
        bpm: selected.bpm,
        length: selected.length
    }, 'osu', selected.mods);

    const duration = formatTime(length);
    const linkScore = `[https://osu.ppy.sh/scores/osu/${selected.scoreId} ${locale === 'FR' ? 'ce score' : 'that score'}]`;
    const linkBeatmap = `[https://osu.ppy.sh/b/${selected.beatmap_id} ${selected.title} - ${selected.artist}]`;
    const ppText = `${parseFloat(selected.pp).toFixed(0)} PP`;
    const stars = `${parseFloat(beatmapInfo.difficultyrating).toFixed(2)} ★ (NM)`;
    const stats = `AR${ar} CS${cs} OD${od} HP${hp}`;
    const target = `${targetPP || '?'}PP`;

    let infoPrefix = '';

    const hasUnsupported = unsupportedMods?.length > 0;
    const hasUnknown = unknownTokens?.length > 0;

    if (hasUnsupported || hasUnknown) {
        if (locale === 'FR') {
            const parts = [];

            if (hasUnsupported) {
                parts.push(`Le${unsupportedMods.length > 1 ? 's mods suivants ne sont pas pris en charge' : ' mod suivant n’est pas pris en charge'} : ${unsupportedMods.join(', ')}`);
            }

            if (hasUnknown) {
                parts.push(`${hasUnsupported ? 'et ' : ''}je n'ai pas reconnu ${unknownTokens.length > 1 ? 'les tokens suivants' : 'le token suivant'} : ${unknownTokens.join(', ')}`);
            }

            infoPrefix = `${parts.join(', ')}. ${hasUnsupported && hasUnknown ? 'Aucun d’eux' : 'Il' + (hasUnsupported || unknownTokens.length > 1 ? 's' : '')} ne sera pris en compte.\n`;
        } else {
            const parts = [];

            if (hasUnsupported) {
                parts.push(`The following mod${unsupportedMods.length > 1 ? 's are' : ' is'} not supported: ${unsupportedMods.join(', ')}`);
            }

            if (hasUnknown) {
                parts.push(`${hasUnsupported ? 'and ' : ''}I didn't recognize ${unknownTokens.length > 1 ? 'these tokens' : 'this token'}: ${unknownTokens.join(', ')}`);
            }

            infoPrefix = `${parts.join(', ')}. ${hasUnsupported && hasUnknown ? 'None of them' : (hasUnsupported || unknownTokens.length > 1 ? 'They' : 'It')} won't be taken into account.\n`;
        }
    }

    const messageBody = locale === 'FR'
        ? `J'ai trouvé cette beatmap que tu n'as probablement pas faite, d'après ${linkScore} ! ↪ ${linkBeatmap} (${selected.version}) ${osuUtils.ModsIntToString(selected.mods)} | Estimation du gain de PP : ${ppText} | Durée : ${duration} | ${stars} | ${stats} | Rankup cible ${target}`
        : `I found this beatmap that you probably haven’t played, based on ${linkScore} ! ↪ ${linkBeatmap} (${selected.version}) ${osuUtils.ModsIntToString(selected.mods)} | Estimate of PP gain: ${ppText} | Duration: ${duration} | ${stars} | ${stats} | Target rankup ${target}`;

    return `${infoPrefix}${messageBody}`;
}



function buildNotFoundMessage(locale) {
    return locale === 'FR'
        ? `Je suis désolé mais je n'ai pas trouvé de beatmap avec ces critères.`
        : `I’m sorry but I couldn’t find a beatmap with these criteria.`;
}

function buildInternalError(locale, id) {
    return locale === 'FR'
        ? `Quelque chose s'est mal passé.. Si cela se reproduit, merci de me contacter sur Discord "Puparia" avec ce code: ${id}`
        : `Something went wrong. If this happens again, please contact me on Discord "Puparia" with this code: ${id}`;
}

module.exports = {
    SendBeatmapMessage: buildBeatmapMessage,
    SendNotFoundBeatmapMessage: buildNotFoundMessage,
    SendErrorInternal: buildInternalError
};
