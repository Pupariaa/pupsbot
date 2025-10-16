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

    // Return ALL scores, just categorized by preference - NO RESTRICTION
    const prioritized = [];
    const fallback = [];
    const other = [];

    for (const score of results) {
        const scoreMods = parseInt(score.mods, 10);
        const scoreModsArray = bitwiseToMods(scoreMods);
        
        // Check if it's an avoided mod
        const hasAvoidedMod = modHierarchy.avoidMods.some(avoidMod => 
            scoreModsArray.includes(avoidMod)
        );

        // Simple categorization - no filtering, just ordering
        if (hasAvoidedMod) {
            other.push(score); // Avoided mods go last
        } else {
            // Check if it matches the primary mods
            const requiredModsArray = modHierarchy.primaryMods || [];
            const scoreModsKey = scoreModsArray.sort().join(',');
            const primaryModsKey = requiredModsArray.sort().join(',');
            
            if (scoreModsKey === primaryModsKey) {
                prioritized.push(score);
            } else {
                fallback.push(score);
            }
        }
    }

    // Return ALL scores categorized by preference (no exclusion)
    return [...prioritized, ...fallback, ...other];
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
