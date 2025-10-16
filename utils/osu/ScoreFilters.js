/**
 * Score filtering utilities for beatmap recommendation
 */

const modsToBitwise = require('./modsToBitwise');

function filterOutTop100(results, beatmapIdSet) {
    if (beatmapIdSet instanceof Set) {
        return results.filter(score => !beatmapIdSet.has(parseInt(score.beatmap_id, 10)));
    } else if (Array.isArray(beatmapIdSet)) {
        return results.filter(score => !beatmapIdSet.includes(parseInt(score.beatmap_id, 10)));
    } else if (beatmapIdSet && typeof beatmapIdSet === 'object') {
        const beatmapIds = Object.keys(beatmapIdSet).map(id => parseInt(id, 10));
        return results.filter(score => !beatmapIds.includes(parseInt(score.beatmap_id, 10)));
    }
    return results;
}

function filterByModsWithHierarchy(results, requiredModsArray, modHierarchy = null, isAllowOtherMods = false) {
    if (!modHierarchy) {
        // Fallback to original filtering if no hierarchy
        return filterByMods(results, requiredModsArray, isAllowOtherMods);
    }

    const requiredMods = modsToBitwise(requiredModsArray);
    const neutralModsMask = 32 | 16384;
    const avoidMods = modsToBitwise(modHierarchy.avoidMods);

    // First pass: filter out avoided mods
    let filtered = results.filter(score => {
        const scoreMods = parseInt(score.mods, 10);
        const scoreModsWithoutNeutral = scoreMods & ~neutralModsMask;
        
        // Avoid scores with mods the user rarely uses
        if (avoidMods > 0 && (scoreModsWithoutNeutral & avoidMods) === avoidMods) {
            return false;
        }
        
        return true;
    });

    // Second pass: prioritize by hierarchy
    const prioritized = [];
    const fallback = [];

    for (const score of filtered) {
        const scoreMods = parseInt(score.mods, 10);
        const scoreModsWithoutNeutral = scoreMods & ~neutralModsMask;
        const requiredWithoutNeutral = requiredMods & ~neutralModsMask;

        let isPreferred = false;

        if (requiredWithoutNeutral === 0 && !isAllowOtherMods) {
            isPreferred = scoreModsWithoutNeutral === 0;
        } else if (isAllowOtherMods) {
            isPreferred = (scoreModsWithoutNeutral & requiredWithoutNeutral) === requiredWithoutNeutral;
        } else {
            isPreferred = scoreModsWithoutNeutral === requiredWithoutNeutral;
        }

        if (isPreferred) {
            prioritized.push(score);
        } else {
            // Check if it's a fallback option
            const scoreModsArray = bitwiseToMods(scoreModsWithoutNeutral);
            const isFallbackMod = modHierarchy.fallbackMods.some(fallbackMods => 
                arraysEqual(scoreModsArray.sort(), fallbackMods.sort())
            );
            
            if (isFallbackMod) {
                fallback.push(score);
            }
        }
    }

    // Return prioritized first, then fallback
    return [...prioritized, ...fallback];
}

function filterByMods(results, requiredModsArray, isAllowOtherMods = false) {
    const requiredMods = modsToBitwise(requiredModsArray);
    const neutralModsMask = 32 | 16384;

    return results.filter(score => {
        const scoreMods = parseInt(score.mods, 10);
        const scoreModsWithoutNeutral = scoreMods & ~neutralModsMask;
        const requiredWithoutNeutral = requiredMods & ~neutralModsMask;

        if (requiredWithoutNeutral === 0 && !isAllowOtherMods) {
            return scoreModsWithoutNeutral === 0;
        }

        if (isAllowOtherMods) {
            return (scoreModsWithoutNeutral & requiredWithoutNeutral) === requiredWithoutNeutral;
        } else {
            return scoreModsWithoutNeutral === requiredWithoutNeutral;
        }
    });
}

function bitwiseToMods(bitwise) {
    const mods = [];
    if (bitwise & 8) mods.push('HD');
    if (bitwise & 16) mods.push('HR');
    if (bitwise & 64) mods.push('DT');
    if (bitwise & 1) mods.push('NF');
    if (bitwise & 2) mods.push('EZ');
    if (bitwise & 32) mods.push('SD');
    if (bitwise & 1024) mods.push('FL');
    if (bitwise & 4096) mods.push('SO');
    if (bitwise & 128) mods.push('RX');
    if (bitwise & 8192) mods.push('AP');
    if (bitwise & 16384) mods.push('PF');
    if (bitwise & 1048576) mods.push('FI');
    return mods;
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function pickBestRandomPrecision(filtered) {
    for (let precision = 1; precision <= 8; precision++) {
        const candidates = filtered.filter(s => parseInt(s.precision) === precision);
        if (candidates.length > 0) {
            const rand = Math.floor(Math.random() * candidates.length);
            return candidates[rand];
        }
    }
    return null;
}

function pickClosestToTargetPP(filtered, targetPP) {
    if (!filtered || filtered.length === 0) return null;

    return filtered.reduce((closest, current) => {
        const currentDiff = Math.abs(parseFloat(current.pp) - targetPP);
        const closestDiff = Math.abs(parseFloat(closest.pp) - targetPP);
        return currentDiff < closestDiff ? current : closest;
    });
}

module.exports = {
    filterOutTop100,
    filterByMods,
    filterByModsWithHierarchy,
    pickBestRandomPrecision,
    pickClosestToTargetPP
};
