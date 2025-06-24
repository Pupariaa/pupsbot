const ojsama = require("ojsama");

async function extractOsuMode(content) {
    const lines = content.split('\n');
    for (const line of lines) {
        if (line.startsWith('Mode:')) {
            const mode = parseInt(line.split(':')[1].trim());
            return isNaN(mode) ? null : mode;
        }
    }
    return null;
}

async function calculatePPWithMods(beatmapId) {
    if (!beatmapId || typeof beatmapId !== "string") {
        throw new TypeError("The beatmapId must be a valid string.");
    }

    const beatmapData = await fetchBeatmapData(beatmapId);
    const mode = await extractOsuMode(beatmapData);
    if (mode !== 0) {
        return { error: 'Only Standard mode is supported.' };
    }
    const beatmap = parseOsuFile(beatmapData);


    const totalObjects = beatmap.objects.length;
    const maxCombo = beatmap.max_combo();

    const targetAccuracies = [100, 98, 95, 90];

    const modVariants = [
        { name: "NoMod", bits: 0 },
        { name: "HD", bits: 8 },
        { name: "HR", bits: 16 },
        { name: "DT", bits: 64 },
        { name: "DTHD", bits: 72 },
        { name: "DTHR", bits: 80 },
        { name: "HDHR", bits: 24 }
    ];

    const ppTable = {};

    for (const mod of modVariants) {
        ppTable[mod.name] = {};

        for (const acc of targetAccuracies) {
            const hitCounts = estimateHitDistribution(acc, totalObjects);
            const starRating = calculateStarRating(beatmap, mod.bits);

            const pp = calculatePerformancePoints({
                stars: starRating,
                combo: maxCombo,
                hits: hitCounts,
                mods: mod.bits
            });

            ppTable[mod.name][acc] = pp;
        }
    }

    return ppTable;
}
async function fetchBeatmapData(beatmapId) {
    try {
        const response = await fetch(`https://osu.ppy.sh/osu/${beatmapId}`, { timeout: 7000 });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        return await response.text();
    } catch (error) {
        throw new Error(`Failed to fetch beatmap ${beatmapId}: ${error.message}`);
    }
}
function parseOsuFile(rawData) {
    try {
        const parser = new ojsama.parser();
        parser.feed(rawData);
        return parser.map;
    } catch (error) {
        throw new Error(`Failed to parse .osu file: ${error.message}`);
    }
}
function estimateHitDistribution(accuracyPercent, objectCount) {
    const count100 = Math.round(((300 - 3 * accuracyPercent) * objectCount) / 200);
    const count300 = objectCount - count100;

    return {
        n300: count300,
        n100: count100,
        n50: 0,
        nmiss: 0
    };
}
function calculateStarRating(beatmap, modsBitmask) {
    return new ojsama.diff().calc({
        map: beatmap,
        mods: modsBitmask
    });
}
function calculatePerformancePoints({ stars, combo, hits, mods }) {
    const result = ojsama.ppv2({
        stars,
        combo,
        n300: hits.n300,
        n100: hits.n100,
        n50: hits.n50,
        nmiss: hits.nmiss,
        mods
    });

    return Math.round(result.total).toString();
}
module.exports = calculatePPWithMods;
