/**
 * Score filtering utilities for beatmap recommendation
 */

const modsToBitwise = require('./modsToBitwise');
const DT_BIT = 64;

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

// COMMENTED: Mod hierarchy system - reverting to original behavior
/*
function filterByModsWithHierarchy(results, requiredModsArray, modHierarchy = null, isAllowOtherMods = false) {
    // Return ALL scores without any filtering - just return them as-is
    // The worker will handle the progressive fallback
    return results;
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
*/

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

function pickClosestToTargetPPWithDistribution(filtered, targetPP, distributionManager) {
    if (!filtered || filtered.length === 0) return null;

    // Create distribution tiers for better prioritization
    const scoresWithTiers = filtered.map(score => {
        const scorePP = parseFloat(score.pp);
        const ppDiff = Math.abs(scorePP - targetPP);

        const beatmapId = parseInt(score.beatmap_id);
        const distributionCount = distributionManager.getDistributionCount(beatmapId);

        // Define distribution tiers
        let distributionTier;
        if (distributionCount === 0) {
            distributionTier = 1; // Highest priority - never distributed
        } else if (distributionCount <= 5) {
            distributionTier = 2; // Very low distribution
        } else if (distributionCount <= 15) {
            distributionTier = 3; // Low distribution
        } else if (distributionCount <= 50) {
            distributionTier = 4; // Medium distribution
        } else {
            distributionTier = 5; // High distribution - lowest priority
        }

        return {
            score,
            ppDiff,
            distributionCount,
            distributionTier
        };
    });

    // Sort by tier first, then by PP closeness within each tier
    scoresWithTiers.sort((a, b) => {
        // Primary sort: distribution tier (lower = better)
        if (a.distributionTier !== b.distributionTier) {
            return a.distributionTier - b.distributionTier;
        }

        // Secondary sort: PP closeness (lower diff = better)
        return a.ppDiff - b.ppDiff;
    });

    // Log selection info
    const selected = scoresWithTiers[0];
    console.log(`[DISTRIBUTION_SELECTION] Selected beatmap ${selected.score.beatmap_id} with ${selected.distributionCount} distributions (tier ${selected.distributionTier}, PP diff: ${selected.ppDiff.toFixed(1)})`);

    return selected.score;
}

function pickClosestToTargetPP(filtered, targetPP) {
    if (!filtered || filtered.length === 0) return null;

    return filtered.reduce((closest, current) => {
        const currentDiff = Math.abs(parseFloat(current.pp) - targetPP);
        const closestDiff = Math.abs(parseFloat(closest.pp) - targetPP);
        return currentDiff < closestDiff ? current : closest;
    });
}

function getMissCount(score) {
    const candidates = [
        score.miss,
        score.count_miss,
        score.statistics_count_miss,
        score.statistics?.count_miss,
        score.stats?.count_miss
    ];

    for (const value of candidates) {
        if (value === undefined || value === null) continue;
        const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
        if (!Number.isNaN(num)) {
            return num;
        }
    }

    if (score.perfect === '1' || score.perfect === 1 || score.perfect === true) {
        return 0;
    }

    return null;
}

function filterFCOnly(results) {
    return results.filter(score => {
        const missCount = getMissCount(score);
        return missCount === 0;
    });
}

function extractAccuracy(score) {
    const candidates = [
        score.accuracy,
        score.acc,
        score.Accuracy,
        score.ACC,
        score.acc_percent,
        score.accPercent,
        score.accuracy_percentage,
        score.accuracy_percent,
        score.accPercentages,
        score.accuraccy // Legacy typo
    ];

    for (const value of candidates) {
        if (value === undefined || value === null) continue;
        const cleaned = typeof value === 'string' ? value.replace('%', '').trim() : value;
        const num = typeof cleaned === 'string' ? parseFloat(cleaned) : Number(cleaned);
        if (!Number.isNaN(num)) {
            return num;
        }
    }

    return null;
}

function filterByAccuracy(results, filter) {
    if (!filter || filter.value === null || filter.value === undefined) return results;
    const threshold = parseFloat(filter.value);
    if (Number.isNaN(threshold)) return results;

    const normalizedThreshold = threshold > 1 ? threshold / 100 : threshold;
    const operator = filter.operator === '<' ? '<' : '>';

    return results.filter(score => {
        const accValue = extractAccuracy(score);
        if (accValue === null) return false;

        const normalizedAcc = accValue > 1 ? accValue / 100 : accValue;
        return operator === '<'
            ? normalizedAcc <= normalizedThreshold
            : normalizedAcc >= normalizedThreshold;
    });
}

function getScoreLengthSeconds(score) {
    const candidates = [
        score.length,
        score.total_length,
        score.beatmap_length,
        score.duration,
        score.totalLength
    ];

    let baseLength = null;
    for (const value of candidates) {
        if (value === undefined || value === null) continue;
        const num = typeof value === 'string' ? parseFloat(value) : Number(value);
        if (!Number.isNaN(num) && num > 0) {
            baseLength = num;
            break;
        }
    }

    if (baseLength === null) return null;

    const mods = parseInt(score.mods, 10);
    if (!Number.isNaN(mods) && (mods & DT_BIT)) {
        return baseLength / 1.5;
    }

    return baseLength;
}

function filterByLength(results, filter) {
    if (!filter || filter.value === null || filter.value === undefined) return results;
    const threshold = parseFloat(filter.value);
    if (Number.isNaN(threshold)) return results;
    const operator = filter.operator === '<' ? '<' : '>';

    return results.filter(score => {
        const length = getScoreLengthSeconds(score);
        if (length === null) return false;
        return operator === '<'
            ? length <= threshold
            : length >= threshold;
    });
}

module.exports = {
    filterOutTop100,
    filterByMods,
    // filterByModsWithHierarchy, // COMMENTED: Mod hierarchy system
    pickBestRandomPrecision,
    pickClosestToTargetPP,
    pickClosestToTargetPPWithDistribution,
    filterFCOnly,
    filterByAccuracy,
    filterByLength,
    getMissCount,
    getScoreLengthSeconds
};
