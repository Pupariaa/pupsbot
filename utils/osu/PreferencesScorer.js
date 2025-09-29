/**
 * Calculates preference scores based on user's gaming habits
 */

function calculatePreferenceScore(score, userStats) {
    let totalScore = 0;
    let factors = 0;

    // Mods preference (weight: 40%)
    if (userStats.modsDistribution) {
        const modsScore = calculateModsPreferenceScore(score, userStats.modsDistribution);
        totalScore += modsScore * 0.4;
        factors += 0.4;
    }

    // Duration preference (weight: 20%)
    if (userStats.durationDistribution) {
        const durationScore = calculateDurationPreferenceScore(score, userStats.durationDistribution);
        totalScore += durationScore * 0.2;
        factors += 0.2;
    }

    // AR preference (weight: 40%)
    if (userStats.averageStats && score.ar) {
        const arScore = calculateARPreferenceScore(parseFloat(score.ar), userStats.averageStats);
        totalScore += arScore * 0.4;
        factors += 0.4;
    }

    return factors > 0 ? totalScore / factors : 0;
}

function calculateModsPreferenceScore(score, userModsDistribution) {
    if (!score.mods || score.mods === "0" || score.mods === "") {
        return parseFloat(userModsDistribution['NM']?.percentage || '0');
    }

    const scoreMods = score.mods.split(',').filter(mod => mod.trim() !== '');
    let totalPreferenceScore = 0;
    let modCount = 0;

    scoreMods.forEach(mod => {
        const modPreference = userModsDistribution[mod];
        if (modPreference) {
            totalPreferenceScore += parseFloat(modPreference.percentage);
            modCount++;
        }
    });

    return modCount > 0 ? totalPreferenceScore / modCount : 0;
}

function calculateDurationPreferenceScore(score, userDurationDistribution) {
    if (!score.total_length) return 0;

    const length = parseFloat(score.total_length);
    let userPreference = 0;

    if (length < 120) {
        userPreference = parseFloat(userDurationDistribution.short?.percentage || '0');
    } else if (length < 240) {
        userPreference = parseFloat(userDurationDistribution.medium?.percentage || '0');
    } else if (length < 360) {
        userPreference = parseFloat(userDurationDistribution.long?.percentage || '0');
    } else {
        userPreference = parseFloat(userDurationDistribution.veryLong?.percentage || '0');
    }

    return userPreference;
}

function calculateARPreferenceScore(scoreAR, userAverageStats) {
    const userAR = parseFloat(userAverageStats.ar || '0');
    if (userAR === 0) return 0;

    // Calculate how close the score AR is to user's preferred AR
    const arDifference = Math.abs(scoreAR - userAR);

    // Convert to percentage (closer = higher score)
    // AR difference of 0 = 100%, difference of 2 = 0%
    const arScore = Math.max(0, 100 - (arDifference * 50));

    return arScore;
}

module.exports = {
    calculatePreferenceScore,
    calculateModsPreferenceScore,
    calculateDurationPreferenceScore,
    calculateARPreferenceScore
};
