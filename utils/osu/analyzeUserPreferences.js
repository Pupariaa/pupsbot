const Logger = require('../Logger');

function analyzeUserPreferences(scores) {
    if (!scores || scores.length === 0) {
        return {
            modsDistribution: {},
            durationDistribution: {},
            averageStats: {},
            totalScores: 0
        };
    }

    const modsCount = {};
    const durationRanges = {
        short: 0,    // < 2min
        medium: 0,   // 2-4min
        long: 0,     // 4-6min
        veryLong: 0  // > 6min
    };

    let totalAr = 0;
    let totalCs = 0;
    let totalBpm = 0;
    let totalLength = 0;
    let validStatsCount = 0;

    scores.forEach(score => {
        // Analyze mods
        const mods = score.enabled_mods || '';
        if (mods === '') {
            modsCount['NM'] = (modsCount['NM'] || 0) + 1;
        } else {
            const modList = mods.split(',');
            modList.forEach(mod => {
                modsCount[mod] = (modsCount[mod] || 0) + 1;
            });
        }

        // Analyze duration
        const length = parseFloat(score.total_length) || 0;
        if (length > 0) {
            if (length < 120) {
                durationRanges.short++;
            } else if (length < 240) {
                durationRanges.medium++;
            } else if (length < 360) {
                durationRanges.long++;
            } else {
                durationRanges.veryLong++;
            }
        }

        // Analyze average stats
        const ar = parseFloat(score.ar);
        const cs = parseFloat(score.cs);
        const bpm = parseFloat(score.bpm);

        if (!isNaN(ar)) {
            totalAr += ar;
            validStatsCount++;
        }
        if (!isNaN(cs)) {
            totalCs += cs;
        }
        if (!isNaN(bpm)) {
            totalBpm += bpm;
        }
        if (!isNaN(length)) {
            totalLength += length;
        }
    });

    // Calculate percentages for mods
    const totalScores = scores.length;
    const modsDistribution = {};
    Object.keys(modsCount).forEach(mod => {
        modsDistribution[mod] = {
            count: modsCount[mod],
            percentage: ((modsCount[mod] / totalScores) * 100).toFixed(1)
        };
    });

    // Calculate percentages for duration
    const durationDistribution = {};
    Object.keys(durationRanges).forEach(range => {
        const count = durationRanges[range];
        durationDistribution[range] = {
            count: count,
            percentage: ((count / totalScores) * 100).toFixed(1)
        };
    });

    // Calculate average stats
    const averageStats = {
        ar: validStatsCount > 0 ? (totalAr / validStatsCount).toFixed(1) : 0,
        cs: validStatsCount > 0 ? (totalCs / validStatsCount).toFixed(1) : 0,
        bpm: validStatsCount > 0 ? (totalBpm / validStatsCount).toFixed(0) : 0,
        length: validStatsCount > 0 ? (totalLength / validStatsCount).toFixed(0) : 0
    };

    return {
        modsDistribution,
        durationDistribution,
        averageStats,
        totalScores
    };
}

module.exports = analyzeUserPreferences;
