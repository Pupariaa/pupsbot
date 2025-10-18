const fs = require('fs');
const path = require('path');
const Logger = require('../utils/Logger');

class DistributionManager {
    constructor() {
        this.distributionData = new Map();
        this.isLoaded = false;
    }

    async loadDistributionData() {
        try {
            const filePath = path.join(__dirname, '../most_distribued-16-10-2025.json');
            const rawData = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(rawData);

            // Convert array to Map for O(1) lookup
            jsonData.rows.forEach(row => {
                this.distributionData.set(row.beatmap_id, row.count);
            });

            this.isLoaded = true;
            Logger.service(`[DISTRIBUTION] Loaded ${this.distributionData.size} beatmap distribution records`);

            // Log some stats
            const counts = Array.from(this.distributionData.values());
            const minCount = Math.min(...counts);
            const maxCount = Math.max(...counts);
            const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;

            Logger.service(`[DISTRIBUTION] Stats: min=${minCount}, max=${maxCount}, avg=${avgCount.toFixed(1)}`);

        } catch (error) {
            Logger.errorCatch('Failed to load distribution data', error);
            this.isLoaded = false;
        }
    }

    getDistributionCount(beatmapId) {
        if (!this.isLoaded) {
            return 0; // Default to 0 if not loaded
        }
        return this.distributionData.get(beatmapId) || 0;
    }

    isDataLoaded() {
        return this.isLoaded;
    }

    // Get distribution score for prioritization (lower count = higher priority)
    getPriorityScore(beatmapId) {
        const count = this.getDistributionCount(beatmapId);
        // Convert to priority score: lower count = higher priority
        // Use inverse relationship: maxCount - count + 1
        const maxCount = Math.max(...Array.from(this.distributionData.values()));
        return maxCount - count + 1;
    }
}

module.exports = DistributionManager;
