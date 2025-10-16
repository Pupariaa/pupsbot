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

    // Return ALL scores in PP range, categorized by preference
    const prioritized = [];
    const fallback = [];
    const other = [];

    for (const score of results) {
        const scoreMods = parseInt(score.mods, 10);
        const scoreModsWithoutNeutral = scoreMods & ~neutralModsMask;
        const requiredWithoutNeutral = requiredMods & ~neutralModsMask;

        // Check if it's an avoided mod
        const scoreModsArray = bitwiseToMods(scoreModsWithoutNeutral);
        const hasAvoidedMod = modHierarchy.avoidMods.some(avoidMod => 
            scoreModsArray.includes(avoidMod)
        );

        // Much more permissive logic - prioritize based on mod hierarchy, not strict matching
        let isPreferred = false;
        let isFallback = false;

        if (requiredWithoutNeutral === 0) {
            // Looking for no mods
            isPreferred = scoreModsWithoutNeutral === 0;
            isFallback = scoreModsWithoutNeutral !== 0 && !hasAvoidedMod;
        } else {
            // Looking for specific mods - be more permissive
            if (isAllowOtherMods) {
                // If allowOtherMods, any score with the required mods is preferred
                isPreferred = (scoreModsWithoutNeutral & requiredWithoutNeutral) === requiredWithoutNeutral;
                isFallback = !isPreferred && !hasAvoidedMod;
            } else {
                // Exact match is preferred, but also allow partial matches as fallback
                isPreferred = scoreModsWithoutNeutral === requiredWithoutNeutral;
                isFallback = (scoreModsWithoutNeutral & requiredWithoutNeutral) === requiredWithoutNeutral && !isPreferred;
            }
        }

        if (isPreferred) {
            prioritized.push(score);
        } else if (isFallback) {
            fallback.push(score);
        } else if (!hasAvoidedMod) {
            // Include non-avoided mods as other options
            other.push(score);
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
