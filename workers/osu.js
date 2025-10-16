const Logger = require('../utils/Logger');
const RedisStore = require('../services/RedisStore');
const Thread2Database = require('../services/SQL');
const MetricsCollector = require('../services/MetricsCollector');
const Notifier = require('../services/Notifier');
const OsuApiClient = require('../services/OsuApis/Client');
const { SendBeatmapMessage, SendNotFoundBeatmapMessage, SendErrorInternal } = require('../utils/messages');
const { getUserErrorMessage } = require('../utils/UserFacingError');
const parseCommandParameters = require('../utils/parser/commandParser');
const computeCrossModeProgressionPotential = require('../compute/osu/CrossModeProgressionPotential');
const computeTargetPP = require('../compute/osu/targetPP');
const { analyzeUserMods } = require('../utils/osu/analyzeUserMods');
const analyzeUserPreferences = require('../utils/osu/analyzeUserPreferences');
const { calculatePreferenceScore } = require('../utils/osu/PreferencesScorer');
const { filterOutTop100, filterByMods, filterByModsWithHierarchy, pickClosestToTargetPP } = require('../utils/osu/ScoreFilters');
const AlgorithmManager = require('../managers/AlgorithmManager');
const UserPreferencesManager = require('../managers/UserPreferencesManager');

const osuApi = new OsuApiClient('http://localhost:25586');
const notifier = new Notifier();
const algorithmManager = new AlgorithmManager();
const userPreferencesManager = new UserPreferencesManager();

function createModHierarchy(userModsAnalysis) {
    const avoidThreshold = 2; // Avoid mods used less than 2% (was 5%)
    const dominantThreshold = 15; // Consider dominant if used more than 15% (was 20%)

    const avoidMods = [];
    const dominantMods = [];
    const moderateMods = [];
    const noMods = userModsAnalysis.modsDistribution['NM'] || { percentage: 0 };

    // Analyze each mod combination
    for (const [modsKey, data] of Object.entries(userModsAnalysis.modsDistribution)) {
        if (modsKey === 'NM') continue;

        const percentage = data.percentage;
        const mods = modsKey.split(',');

        if (percentage < avoidThreshold) {
            // Avoid mods that are rarely used
            avoidMods.push(...mods);
        } else if (percentage >= dominantThreshold) {
            // Dominant mods
            dominantMods.push({ mods, percentage, weight: data.percentage / 100 });
        } else {
            // Moderate usage mods
            moderateMods.push({ mods, percentage, weight: data.percentage / 100 });
        }
    }

    // Remove duplicates
    const uniqueAvoidMods = [...new Set(avoidMods)];
    const uniqueDominantMods = dominantMods.map(d => d.mods.join(','));
    const uniqueModerateMods = moderateMods.map(m => m.mods.join(','));

    // Create hierarchy: dominant mods first, then no mods, then moderate mods
    let primaryMods = [];
    let fallbackMods = [];

    if (uniqueDominantMods.length > 0) {
        // Use most dominant mod combination
        const mostDominant = dominantMods.sort((a, b) => b.percentage - a.percentage)[0];
        primaryMods = mostDominant.mods;

        // Add some randomness: 20% chance to use other dominant mods
        if (Math.random() < 0.2 && dominantMods.length > 1) {
            const randomDominant = dominantMods[Math.floor(Math.random() * dominantMods.length)];
            primaryMods = randomDominant.mods;
        }
    } else if (noMods.percentage > 10) {
        // If no dominant mods, prefer no mods if user uses them reasonably
        primaryMods = [];
    } else if (uniqueModerateMods.length > 0) {
        // Fallback to moderate mods
        const randomModerate = moderateMods[Math.floor(Math.random() * moderateMods.length)];
        primaryMods = randomModerate.mods;
    }

    // Create fallback chain: primary -> no mods -> moderate mods
    fallbackMods = [];
    if (primaryMods.length > 0) {
        fallbackMods.push([]); // No mods as first fallback
    }
    if (uniqueModerateMods.length > 0) {
        fallbackMods.push(...uniqueModerateMods.map(mods => mods.split(',')));
    }

    return {
        primaryMods,
        fallbackMods,
        avoidMods: uniqueAvoidMods,
        dominantMods: uniqueDominantMods,
        moderateMods: uniqueModerateMods,
        noModsPercentage: noMods.percentage
    };
}


async function sendErrorResponse(data, errorCode, message) {
    try {
        const locale = data.user?.locale || 'FR';
        const errorMsg = message || SendErrorInternal(locale, data.event.id);

        process.send({
            username: data.event.nick,
            response: errorMsg,
            id: data.event.id,
            beatmapId: 0,
            userId: data.user.id,
            success: true,
            errorCode: errorCode
        });
    } catch (sendError) {
        Logger.errorCatch('OSU Worker → Send Error Response', sendError);
    }
}

process.on('message', async (data) => {
    GlobalData = data;

    if (!data.event.rateLimitValid) {
        Logger.service(`[WORKER] Rate limit invalid for user ${data.user.id}, aborting`);
        await sendErrorResponse(data, 'ERR_RATE_LIMIT');
        return;
    }

    const db = new Thread2Database();
    const redisStore = new RedisStore();
    const metricsCollector = new MetricsCollector();
    const startTime = Date.now();

    try {
        Logger.task('OSU Worker received data, starting processing...');
        await userPreferencesManager.init();
        const user = data.user;
        const userPreferences = await userPreferencesManager.getUserPreferences(user.id);
        const params = parseCommandParameters(data.event.message, 'osu', userPreferences);
        const event = data.event;

        let top100 = await redisStore.getTop100(user.id);
        await metricsCollector.recordStepDuration(data.event.id, 'get_top100_cache');

        if (!top100) {
            top100 = await osuApi.getTopScoresAllModes(data.user.id, data.event.id);
            await metricsCollector.recordStepDuration(data.event.id, 'get_top100_api');
            if (top100) {
                await redisStore.recordTop100(data.user.id, top100, 300);
                await metricsCollector.recordStepDuration(data.event.id, 'record_top100_cache');
            }
        } else {
            setImmediate(async () => {
                try {
                    const freshTop100 = await osuApi.getTopScoresAllModes(data.user.id, data.event.id);
                    if (freshTop100) {
                        await redisStore.recordTop100(data.user.id, freshTop100, 300);
                    }
                } catch (error) {
                    Logger.errorCatch('Background top100 update', error);
                }
            });
        }

        if (!top100 || !top100.osu || !top100.osu.tr || top100.osu.tr.length === 0) {
            const msg = await SendNotFoundBeatmapMessage(data.user.locale);
            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_NO_SCORES'
            });
            elapsed = Date.now() - startTime;
            await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, elapsed);
            await metricsCollector.updateCommandResult(data.event.id, 'not_scores');
            return;
        }

        const top100Osu = top100.osu;
        const suggestions = await redisStore.getUserSuggestions(data.user.id);

        const userModsAnalysis = analyzeUserMods(top100Osu.tr);
        if (userModsAnalysis) {
            await redisStore.setUserModsAnalysis(data.user.id, userModsAnalysis, 3600);

            // If no specific mods requested, create intelligent mod hierarchy
            if (params.mods.length === 0) {
                const modHierarchy = createModHierarchy(userModsAnalysis);
                params.mods = modHierarchy.primaryMods;
                params.modHierarchy = modHierarchy;
                Logger.service(`[WORKER] Using mod hierarchy for user ${data.user.id}: Primary=${modHierarchy.primaryMods.join(',')}, Avoid=${modHierarchy.avoidMods.join(',')}`);
            }
        }

        const userStats = analyzeUserPreferences(top100Osu.tr);

        const sum = computeCrossModeProgressionPotential(data.user.id, top100);
        await metricsCollector.recordStepDuration(data.event.id, 'compute_cross_mode_progression_potential');

        const targetPP = computeTargetPP(top100Osu.tr, sum);

        const algorithmResult = await algorithmManager.executeAlgorithmStrategy({
            userPP: data.user.pp,
            top100OsuTr: top100Osu.tr,
            eventId: data.event.id,
            sum,
            mods: params.mods,
            bpm: params.bpm,
            data: { top100, user: data.user },
            allowOtherMods: params.allowOtherMods,
            targetPP: params?.pp ? params.pp : targetPP,
            algorithm: params.algorithm
        });

        await metricsCollector.recordStepDuration(data.event.id, 'find_scores_by_pprange');

        if (!algorithmResult.results || algorithmResult.results.length === 0) {
            const msg = await SendNotFoundBeatmapMessage(data.user.locale);
            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_NO_BEATMAP'
            });
            elapsed = Date.now() - startTime;
            await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, elapsed);
            await metricsCollector.updateCommandResult(data.event.id, 'not_beatmap');
            return;
        }

        await metricsCollector.recordStepDuration(data.event.id, 'compute_target_pp');

        if (algorithmResult.results && algorithmResult.results.length > 0 && userStats) {
            algorithmResult.results.sort((a, b) => {
                const scoreA = calculatePreferenceScore(a, userStats, userModsAnalysis);
                const scoreB = calculatePreferenceScore(b, userStats, userModsAnalysis);
                return scoreB - scoreA;
            });
        }

        let filtered;
        if (params.modHierarchy) {
            // Use hierarchy only if no specific mods were requested
            filtered = filterByModsWithHierarchy(algorithmResult.results, params.mods, params.modHierarchy, params.allowOtherMods);
            Logger.service(`[WORKER] Using mod hierarchy filtering: ${filtered.length} scores for user ${data.user.id}`);
        } else {
            // Use standard filtering when user specified mods
            filtered = filterByMods(algorithmResult.results, params.mods, params.allowOtherMods);
            Logger.service(`[WORKER] Using standard mod filtering: ${filtered.length} scores for user ${data.user.id}`);
        }
        await metricsCollector.recordStepDuration(data.event.id, 'filter_by_mods');
        
        filtered = filterOutTop100(filtered, top100Osu.table);
        await metricsCollector.recordStepDuration(data.event.id, 'filter_out_top_100');

        // Progressive fallback: start with preferred mods, then expand if needed
        // Only do fallback if user didn't specify mods (params.modHierarchy exists)
        if (filtered.length < 10 && params.modHierarchy) {
            Logger.service(`[WORKER] Only ${filtered.length} results after filtering for user ${data.user.id}, trying progressive fallback`);
            
            // Try with no mods first
            const noModsFiltered = filterByMods(algorithmResult.results, [], params.allowOtherMods);
            const noModsFilteredOut = filterOutTop100(noModsFiltered, top100Osu.table);
            Logger.service(`[WORKER] After no mods fallback: ${noModsFilteredOut.length} scores`);
            
            if (noModsFilteredOut.length > filtered.length) {
                filtered = noModsFilteredOut;
                Logger.service(`[WORKER] Using no mods fallback (${filtered.length} scores)`);
            } else if (filtered.length === 0) {
                // If still nothing, try with any mods (allowOtherMods = true)
                const anyModsFiltered = filterByMods(algorithmResult.results, params.mods, true);
                filtered = filterOutTop100(anyModsFiltered, top100Osu.table);
                Logger.service(`[WORKER] After any mods fallback: ${filtered.length} scores`);
            }
        }

        if (algorithmResult.relaxedCriteria) {
            filtered = filtered.filter(score => score.precision < 10).sort((a, b) => b.precision - a.precision);
        } else {
            filtered = filtered.filter(score => score.precision < 8).sort((a, b) => b.precision - a.precision);
        }
        await metricsCollector.recordStepDuration(data.event.id, 'filter_scores');

        const buildSortListWithProgressiveFallback = async (ppMargin) => {
            const list = [];
            const chunkSize = 10;

            // Process scores in chunks for better performance
            const maxScores = filtered.length;

            for (let i = 0; i < maxScores; i += chunkSize) {
                const chunk = filtered.slice(i, i + chunkSize);

                const chunkResults = await Promise.all(
                    chunk.map(async (score) => {
                        const mapId = parseInt(score.beatmap_id);
                        if (suggestions.includes(mapId.toString())) return null;

                        try {
                            const beatmap = await redisStore.getBeatmap(mapId);
                            if (beatmap) {
                                const mapper = beatmap.creator?.toLowerCase() || '';
                                const title = beatmap.title?.toLowerCase() || '';

                                if (userPreferences.mapperBan && userPreferences.mapperBan.length > 0 &&
                                    userPreferences.mapperBan.some(bannedMapper =>
                                        mapper.includes(bannedMapper.toLowerCase())
                                    )) {
                                    return null;
                                }

                                if (userPreferences.titleBan && userPreferences.titleBan.length > 0 &&
                                    userPreferences.titleBan.some(bannedTitle =>
                                        title.includes(bannedTitle.toLowerCase())
                                    )) {
                                    return null;
                                }
                            }

                            const scorePP = parseFloat(score.pp);
                            let shouldInclude = false;

                            if (params.pp !== null) {
                                shouldInclude = Math.abs(scorePP - params.pp) <= ppMargin;
                            } else {
                                if (algorithmResult.relaxedCriteria) {
                                    shouldInclude = true;
                                } else {
                                    shouldInclude = scorePP >= targetPP && scorePP <= targetPP + 28;
                                }
                            }

                            return shouldInclude ? score : null;
                        } catch (error) {
                            Logger.errorCatch('Worker', `Failed to process score ${mapId}: ${error.message}`);
                            return null;
                        }
                    })
                );

                chunkResults.forEach(result => {
                    if (result) list.push(result);
                });

                // Continue processing all scores, don't stop early
            }

            return list;
        };

        let sortList = [];

        if (params.pp !== null) {
            const margins = [0, 5, 10, 15, 20, 25];
            for (const margin of margins) {
                sortList = await buildSortListWithProgressiveFallback(margin);
                if (sortList.length > 0) {
                    break;
                }
            }
        } else {
            sortList = await buildSortListWithProgressiveFallback(0);
        }

        if (sortList.length === 0) {
            const msg = await SendNotFoundBeatmapMessage(data.user.locale);
            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_NO_BEATMAP'
            });
            elapsed = Date.now() - startTime;
            await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, elapsed);
            await metricsCollector.updateCommandResult(data.event.id, 'not_beatmap');
            return;
        }

        const ppTarget = params.pp !== null ? params.pp : targetPP;
        const selected = pickClosestToTargetPP(sortList, ppTarget);
        await metricsCollector.recordStepDuration(data.event.id, 'pick_closest_to_target_pp');

        if (!selected) {
            const msg = await SendNotFoundBeatmapMessage(data.user.locale);
            process.send({
                username: data.event.nick,
                response: msg,
                id: data.event.id,
                beatmapId: 0,
                userId: data.user.id,
                success: true,
                errorCode: 'ERR_NO_BEATMAP'
            });
            elapsed = Date.now() - startTime;
            await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, elapsed);
            await metricsCollector.updateCommandResult(data.event.id, 'not_beatmap');
            return;
        }

        var beatmap = null;
        if (!await redisStore.getBeatmap(selected.beatmap_id)) {
            beatmap = await osuApi.getBeatmap(selected.beatmap_id);
            await redisStore.recordBeatmap(beatmap);
        } else {
            beatmap = await redisStore.getBeatmap(selected.beatmap_id);
        }
        await metricsCollector.recordStepDuration(data.event.id, 'get_beatmap');

        if (!beatmap) {
            await sendErrorResponse(data, 'ERR_BEATMAP_NOT_FOUND');
            return;
        }

        const response = await SendBeatmapMessage(data.user.locale, selected, beatmap, targetPP, params.unknownTokens, params.unsupportedMods, osuApi);
        const message = response.message;
        await redisStore.trackSuggestedBeatmap(selected.beatmap_id, data.user.id, beatmap.total_length, data.event.id);
        await db.saveSuggestion(data.user.id, selected.beatmap_id, data.event.id, targetPP, selected.mods, algorithmResult.algorithm);
        await metricsCollector.recordStepDuration(data.event.id, 'save_suggestion');

        await metricsCollector.updateCommandResult(data.event.id, 'success');

        await redisStore.addSuggestion(selected.beatmap_id, data.user.id, selected.mods, algorithmResult.algorithm);
        await metricsCollector.recordStepDuration(data.event.id, 'add_suggestion_redis');

        process.send({
            username: data.event.nick,
            response: message,
            id: data.event.id,
            beatmapId: selected.beatmap_id,
            userId: data.user.id,
            success: true
        });

        elapsed = Date.now() - startTime;
        await db.saveCommandHistory(data.event.id, data.event.message, message, data.user.id, data.event.nick, true, elapsed, data.user.locale);
        await db.saveBeatmap(response.beatmap);
        await metricsCollector.recordStepDuration(data.event.id, 'save_command_history');

    } catch (e) {
        Logger.errorCatch('OSU Worker', e);

        try {
            await notifier.send(`OSU Worker Error: ${e.toString()}`, 'WORKER.OSU.FAIL');
        } catch (notifierError) {
            Logger.errorCatch('OSU Worker → Notifier Error', notifierError);
        }

        try {
            await sendErrorResponse(data, 'ERR_WORKER_CRASH');

            try {
                await metricsCollector.updateCommandResult(data.event.id, 'worker_crash');
            } catch (metricsError) {
                Logger.errorCatch('OSU Worker → Metrics Error', metricsError);
            }

            try {
                const locale = data.user?.locale || 'FR';
                const msg = getUserErrorMessage('ERR_WORKER_CRASH', locale);
                await db.saveCommandHistory(data.event.id, data.event.message, msg, data.user.id, data.event.nick, false, 0);
            } catch (dbError) {
                Logger.errorCatch('OSU Worker → DB Error', dbError);
            }

        } catch (inner) {
            Logger.errorCatch('OSU Worker → Secondary Failure', inner);
            try {
                await notifier.send(`Double error in worker.o.js: ${inner.toString()}`, 'WORKER.OSU.FAIL2');
            } catch (notifierError2) {
                Logger.errorCatch('OSU Worker → Notifier Error 2', notifierError2);
            }
        }
    } finally {
        await redisStore.close();
        await metricsCollector.close();
        await userPreferencesManager.close();
        process.removeAllListeners('message');
        try { await db.disconnect(); } catch { }
        if (global.gc) global.gc();
        process.exit(0);
    }
});