const Logger = require('../utils/Logger');
const ErrorHandler = require('../utils/ErrorHandler');

const logger = new Logger();
const errorHandler = new ErrorHandler();

class GameModeManager {
    constructor() {
        this.modes = new Map();
        this.defaultMode = 'osu';
        this.supportedModes = ['osu', 'taiko', 'catch', 'mania'];
        this.modeAliases = new Map([
            ['0', 'osu'],
            ['1', 'taiko'],
            ['2', 'catch'],
            ['3', 'mania'],
            ['std', 'osu'],
            ['standard', 'osu'],
            ['ctb', 'catch'],
            ['fruits', 'catch'],
            ['o', 'osu'],
            ['t', 'taiko'],
            ['c', 'catch'],
            ['m', 'mania']
        ]);

        this.init();
    }

    init() {
        this.loadModeConfigurations();
        logger.info('GAME_MODE_MANAGER', `Initialized with modes: ${this.supportedModes.join(', ')}`);
    }

    loadModeConfigurations() {
        const modeConfigs = {
            osu: {
                id: 0,
                name: 'osu',
                displayName: 'osu!',
                shortName: 'osu',
                enabled: true,
                calculations: ['pp', 'accuracy', 'combo'],
                defaultMods: ['NM', 'HD', 'HR', 'DT', 'FL'],
                workers: {
                    calculator: 'osu',
                    analyzer: 'osu'
                }
            },
            taiko: {
                id: 1,
                name: 'taiko',
                displayName: 'osu!taiko',
                shortName: 'taiko',
                enabled: false,
                calculations: ['pp', 'accuracy'],
                defaultMods: ['NM', 'HD', 'HR', 'DT'],
                workers: {
                    calculator: 'taiko',
                    analyzer: 'taiko'
                }
            },
            catch: {
                id: 2,
                name: 'catch',
                displayName: 'osu!catch',
                shortName: 'ctb',
                enabled: false,
                calculations: ['pp', 'accuracy'],
                defaultMods: ['NM', 'HD', 'HR', 'DT'],
                workers: {
                    calculator: 'catch',
                    analyzer: 'catch'
                }
            },
            mania: {
                id: 3,
                name: 'mania',
                displayName: 'osu!mania',
                shortName: 'mania',
                enabled: true,
                calculations: ['pp', 'accuracy'],
                defaultMods: ['NM', 'HD', 'HR', 'DT', 'FL'],
                workers: {
                    calculator: 'mania',
                    analyzer: 'mania'
                },
                keyConfigs: [4, 5, 6, 7, 8, 9]
            }
        };

        for (const [modeName, config] of Object.entries(modeConfigs)) {
            this.modes.set(modeName, config);
        }
    }

    parseMode(input) {
        if (!input) return this.defaultMode;

        const normalized = input.toString().toLowerCase().trim();
        
        if (this.modeAliases.has(normalized)) {
            return this.modeAliases.get(normalized);
        }
        
        if (this.supportedModes.includes(normalized)) {
            return normalized;
        }

        return this.defaultMode;
    }

    getModeInfo(modeName) {
        const mode = this.parseMode(modeName);
        return this.modes.get(mode);
    }

    isModeEnabled(modeName) {
        const modeInfo = this.getModeInfo(modeName);
        return modeInfo ? modeInfo.enabled : false;
    }

    getModeId(modeName) {
        const modeInfo = this.getModeInfo(modeName);
        return modeInfo ? modeInfo.id : 0;
    }

    getEnabledModes() {
        return Array.from(this.modes.entries())
            .filter(([, config]) => config.enabled)
            .map(([name]) => name);
    }

    validateMode(modeName, throwError = true) {
        const mode = this.parseMode(modeName);
        const modeInfo = this.modes.get(mode);
        
        if (!modeInfo) {
            if (throwError) {
                throw new Error(`Unsupported game mode: ${modeName}`);
            }
            return false;
        }
        
        if (!modeInfo.enabled) {
            if (throwError) {
                throw new Error(`Game mode ${modeInfo.displayName} is currently disabled`);
            }
            return false;
        }
        
        return true;
    }

    getWorkerPath(modeName, workerType = 'calculator') {
        const modeInfo = this.getModeInfo(modeName);
        if (!modeInfo || !modeInfo.workers || !modeInfo.workers[workerType]) {
            return null;
        }
        
        return `../workers/${modeInfo.workers[workerType]}.js`;
    }

    getSupportedMods(modeName) {
        const modeInfo = this.getModeInfo(modeName);
        return modeInfo ? modeInfo.defaultMods : [];
    }

    formatModeDisplay(modeName, includeEmoji = false) {
        const modeInfo = this.getModeInfo(modeName);
        if (!modeInfo) return modeName;
        
        const emojis = {
            osu: '⭕',
            taiko: '🥁',
            catch: '🍎',
            mania: '🎹'
        };
        
        if (includeEmoji && emojis[modeInfo.name]) {
            return `${emojis[modeInfo.name]} ${modeInfo.displayName}`;
        }
        
        return modeInfo.displayName;
    }

    getManiaKeyCount(beatmapCS) {
        if (!beatmapCS) return 4;
        
        const keyMap = {
            1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9
        };
        
        return keyMap[Math.round(beatmapCS)] || 4;
    }

    createModeContext(modeName, additionalData = {}) {
        const modeInfo = this.getModeInfo(modeName);
        if (!modeInfo) {
            throw new Error(`Cannot create context for unsupported mode: ${modeName}`);
        }
        
        return {
            mode: modeInfo,
            timestamp: Date.now(),
            ...additionalData
        };
    }

    logModeUsage(modeName, operation, metadata = {}) {
        logger.info('GAME_MODE_USAGE', `${operation} performed for ${this.formatModeDisplay(modeName)}`, {
            mode: modeName,
            operation,
            ...metadata
        });
    }
}

module.exports = GameModeManager;