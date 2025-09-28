const express = require('express');
const cors = require('cors');
const Logger = require('../../utils/Logger');
const OsuApiManager = require('./Manager');

class OsuApiInternalServer {
    constructor(port = 25586) {
        this.app = express();
        this.port = port;
        this.server = null;
        this.apiManager = null;
        this.isRunning = false;
    }

    async init() {
        try {
            this.apiManager = new OsuApiManager();
            await this.apiManager.init();

            this.app.use(cors());
            this.app.use(express.json({ limit: '10mb' }));
            this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

            this.setupRoutes();
            this.setupErrorHandling();

            Logger.service('OsuApiInternalServer: Initialized');
        } catch (error) {
            Logger.errorCatch('OsuApiInternalServer', `Failed to initialize: ${error.message}`);
            throw error;
        }
    }

    setupRoutes() {
        this.app.get('/health', async (req, res) => {
            try {
                const health = await this.apiManager.healthCheck();
                res.json({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    ...health
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    error: error.message
                });
            }
        });

        this.app.get('/user/:user', async (req, res) => {
            try {
                const { user } = req.params;
                const { mode = 'osu' } = req.query;

                const userData = await this.apiManager.getUser(user, mode);
                res.json({
                    success: true,
                    data: userData
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/user/:userId/full', async (req, res) => {
            try {
                const { userId } = req.params;
                const fullUser = await this.apiManager.v2.getFullUser(userId);
                res.json({
                    success: true,
                    data: fullUser
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/user/:userId/scores/best', async (req, res) => {
            try {
                const { userId } = req.params;
                const options = {
                    mode: req.query.mode || 'osu',
                    limit: parseInt(req.query.limit) || 100,
                    offset: parseInt(req.query.offset) || 0
                };

                const scores = await this.apiManager.getUserBestScores(userId, options);
                res.json({
                    success: true,
                    data: scores
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/user/:userId/scores/top-all-modes', async (req, res) => {
            try {
                const { userId } = req.params;
                const scores = await this.apiManager.getUserBestScores(userId, { mode: 'osu', limit: 100 });
                res.json({
                    success: true,
                    data: scores
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/user/:userId/scores/recent', async (req, res) => {
            try {
                const { userId } = req.params;
                const options = {
                    mode: req.query.mode || 'osu',
                    limit: parseInt(req.query.limit) || 50,
                    offset: parseInt(req.query.offset) || 0,
                    includeFails: req.query.include_fails === 'true'
                };

                const scores = await this.apiManager.v2.getUserRecentScores(userId, options);
                res.json({
                    success: true,
                    data: scores
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/beatmap/:beatmapId', async (req, res) => {
            try {
                const { beatmapId } = req.params;
                const beatmap = await this.apiManager.getBeatmap(beatmapId);
                res.json({
                    success: true,
                    data: beatmap
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/beatmapset/:beatmapsetId', async (req, res) => {
            try {
                const { beatmapsetId } = req.params;
                const beatmapset = await this.apiManager.v2.getBeatmapset(beatmapsetId);
                res.json({
                    success: true,
                    data: beatmapset
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/beatmap/:beatmapId/scores', async (req, res) => {
            try {
                const { beatmapId } = req.params;
                const options = {
                    mode: req.query.mode || 'osu',
                    mods: req.query.mods ? req.query.mods.split(',') : [],
                    type: req.query.type || 'global'
                };

                const scores = await this.apiManager.v2.getBeatmapScores(beatmapId, options);
                res.json({
                    success: true,
                    data: scores
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/beatmap/:beatmapId/scores/user/:userId', async (req, res) => {
            try {
                const { beatmapId, userId } = req.params;
                const options = {
                    mode: req.query.mode || 'osu',
                    mods: req.query.mods ? req.query.mods.split(',') : []
                };

                const score = await this.apiManager.v2.getUserBeatmapScore(beatmapId, userId, options);
                res.json({
                    success: true,
                    data: score
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/search/beatmaps', async (req, res) => {
            try {
                const options = {
                    query: req.query.q || '',
                    mode: req.query.m || 'osu',
                    status: req.query.s || 'ranked',
                    genre: req.query.g || 'any',
                    language: req.query.l || 'any',
                    sort: req.query.sort || 'ranked_desc',
                    cursor: req.query.cursor || null
                };

                const results = await this.apiManager.v2.searchBeatmaps(options);
                res.json({
                    success: true,
                    data: results
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.post('/user/:userId/top-scores/all-modes', async (req, res) => {
            try {
                const { userId } = req.params;
                const { id = 'internal' } = req.body;

                const results = await this.apiManager.v2.getTopScoresAllModes(userId, id);
                res.json({
                    success: true,
                    data: results
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/beatmap/:beatmapId/stars', async (req, res) => {
            try {
                const { beatmapId } = req.params;
                const mods = parseInt(req.query.mods) || 0;
                const ruleset = req.query.ruleset || 'osu';

                const starRating = await this.apiManager.v2.getBeatmapStarRating(beatmapId, mods, ruleset);
                res.json({
                    success: true,
                    data: starRating
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.post('/refresh-token', async (req, res) => {
            try {
                await this.apiManager.refreshToken();
                res.json({
                    success: true,
                    message: 'Token refreshed successfully'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/rate-limiter/stats', async (req, res) => {
            try {
                const stats = this.apiManager.rateLimiter.getStats();
                console.log(stats);
                res.json({
                    success: true,
                    data: stats
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    setupErrorHandling() {
        this.app.use((error, req, res, next) => {
            Logger.errorCatch('OsuApiInternalServer', `Unhandled error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        });

        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found'
            });
        });
    }

    async start() {
        if (this.isRunning) {
            Logger.service('OsuApiInternalServer: Already running');
            return;
        }

        try {
            await this.init();

            this.server = this.app.listen(this.port, () => {
                this.isRunning = true;
                Logger.service(`OsuApiInternalServer: Running on port ${this.port}`);
            });

            this.server.on('error', (error) => {
                Logger.errorCatch('OsuApiInternalServer', `Server error: ${error.message}`);
            });

        } catch (error) {
            Logger.errorCatch('OsuApiInternalServer', `Failed to start server: ${error.message}`);
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) {
            return;
        }

        try {
            if (this.server) {
                this.server.close();
                this.server = null;
            }

            if (this.apiManager) {
                await this.apiManager.close();
                this.apiManager = null;
            }

            this.isRunning = false;
            Logger.service('OsuApiInternalServer: Stopped');
        } catch (error) {
            Logger.errorCatch('OsuApiInternalServer', `Error stopping server: ${error.message}`);
        }
    }

    getPort() {
        return this.port;
    }

    isServerRunning() {
        return this.isRunning;
    }
}

module.exports = OsuApiInternalServer;
