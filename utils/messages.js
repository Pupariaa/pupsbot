const { formatTime } = require('./functions');
const osu_utils = require('osu-utils');
const osuUtils = new osu_utils();

function buildBeatmapMessage(locale, selected, beatmapInfo, targetPP) {
    const { cs, od, hp, ar, bpm, length } = osuUtils.ConvertStatsWithMods({ cs: selected.cs, od: selected.od, hp: selected.hp, ar: selected.ar, bpm: selected.bpm, length: selected.length }, 'osu', selected.mods);
    const duration = formatTime(length);
    const linkScore = `[https://osu.ppy.sh/scores/osu/${selected.scoreId} ${locale === 'FR' ? 'ce score' : 'that score'}]`;
    const linkBeatmap = `[https://osu.ppy.sh/b/${selected.beatmap_id} ${selected.title} - ${selected.artist}]`;
    const ppText = `${parseFloat(selected.pp).toFixed(0)} PP`;

    const stars = `${parseFloat(beatmapInfo.difficultyrating).toFixed(2)} ★ (NM)`;
    const stats = `AR${ar} CS${cs} OD${od} HP${hp}`;
    const target = `${targetPP || '?'}PP`;

    if (locale === 'FR') {
        return `J'ai trouvé cette beatmap que tu n'as probablement pas faite, d'après ${linkScore} ! ↪ ${linkBeatmap} (${selected.version}) ${osuUtils.ModsIntToString(selected.mods)} | Estimation du gain de PP: ${ppText} | Durée: ${duration} | ${stars} | ${stats} | Rankup cible ${target}`;
    } else {
        return `I found this beatmap that you probably haven’t played, based on ${linkScore} ! ↪ ${linkBeatmap} (${selected.version}) ${osuUtils.ModsIntToString(selected.mods)} | Estimate of PP gain: ${ppText} | Duration: ${duration} | ${stars} | ${stats} | Target rankup ${target}`;
    }
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
