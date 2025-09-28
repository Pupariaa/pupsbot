const Logger = require('../Logger');

function analyzeUserMods(top100Scores) {
    if (!top100Scores || !Array.isArray(top100Scores)) {
        Logger.service('[MODS-ANALYZER] No scores provided or invalid format');
        return null;
    }

    const modsDistribution = {};
    const modsWeights = {};
    let totalScores = 0;
    let totalPP = 0;

    for (const score of top100Scores) {
        if (!score.enabled_mods) continue;

        totalScores++;
        const pp = parseFloat(score.pp) || 0;
        totalPP += pp;

        // Parse mods (can be string or array)
        let mods = [];
        if (typeof score.enabled_mods === 'string') {
            mods = score.enabled_mods.split(',').filter(mod => mod.trim() !== '');
        } else if (Array.isArray(score.enabled_mods)) {
            mods = score.enabled_mods.filter(mod => mod && mod.trim() !== '');
        }

        // Create mods key (sorted for consistency)
        const modsKey = mods.length > 0 ? mods.sort().join(',') : 'NM';

        // Count occurrences
        if (!modsDistribution[modsKey]) {
            modsDistribution[modsKey] = {
                count: 0,
                totalPP: 0,
                avgPP: 0,
                percentage: 0
            };
        }

        modsDistribution[modsKey].count++;
        modsDistribution[modsKey].totalPP += pp;
    }

    // Calculate percentages and average PP
    for (const modsKey in modsDistribution) {
        const data = modsDistribution[modsKey];
        data.percentage = (data.count / totalScores) * 100;
        data.avgPP = data.totalPP / data.count;
    }

    // Calculate weights based on frequency and PP contribution
    for (const modsKey in modsDistribution) {
        const data = modsDistribution[modsKey];
        const frequencyWeight = data.percentage / 100; // 0-1
        const ppWeight = totalPP > 0 ? (data.totalPP / totalPP) : 0; // 0-1
        
        // Combined weight (frequency + PP contribution)
        modsWeights[modsKey] = (frequencyWeight * 0.6) + (ppWeight * 0.4);
    }

    // Sort by weight (descending)
    const sortedMods = Object.entries(modsWeights)
        .sort(([,a], [,b]) => b - a)
        .map(([mods, weight]) => ({
            mods: mods === 'NM' ? [] : mods.split(','),
            weight: weight,
            distribution: modsDistribution[mods]
        }));

    const result = {
        totalScores,
        totalPP,
        modsDistribution,
        modsWeights,
        sortedMods,
        primaryMods: sortedMods[0]?.mods || [],
        primaryWeight: sortedMods[0]?.weight || 0
    };

    Logger.service(`[MODS-ANALYZER] Analyzed ${totalScores} scores, primary mods: ${result.primaryMods.join(',') || 'NM'} (${(result.primaryWeight * 100).toFixed(1)}%)`);
    
    return result;
}

function getModsPreference(userModsAnalysis, requestedMods = []) {
    if (!userModsAnalysis || !userModsAnalysis.sortedMods) {
        return { preference: 'unknown', confidence: 0 };
    }

    // If no specific mods requested, return primary preference
    if (requestedMods.length === 0) {
        return {
            preference: userModsAnalysis.primaryMods,
            confidence: userModsAnalysis.primaryWeight,
            distribution: userModsAnalysis.modsDistribution
        };
    }

    // Check if user has experience with requested mods
    const requestedModsKey = requestedMods.sort().join(',');
    const userExperience = userModsAnalysis.modsDistribution[requestedModsKey];

    if (userExperience) {
        return {
            preference: requestedMods,
            confidence: userExperience.percentage / 100,
            experience: userExperience,
            recommendation: userExperience.percentage > 20 ? 'experienced' : 'limited'
        };
    }

    // Find closest match
    const closestMatch = userModsAnalysis.sortedMods.find(modData => 
        requestedMods.some(requestedMod => modData.mods.includes(requestedMod))
    );

    return {
        preference: requestedMods,
        confidence: closestMatch ? closestMatch.weight * 0.5 : 0,
        closestMatch: closestMatch,
        recommendation: 'new_mods'
    };
}

module.exports = {
    analyzeUserMods,
    getModsPreference
};
