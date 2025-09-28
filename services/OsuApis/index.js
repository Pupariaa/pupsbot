const OsuApiManager = require('./Manager');
const OsuApiInternalServer = require('./InternalServer');
const OsuApiClient = require('./Client');
const RateLimiter = require('./RateLimiter');

module.exports = {
    OsuApiManager,
    OsuApiInternalServer,
    OsuApiClient,
    RateLimiter,
    V1: require('./V1'),
    V2: require('./V2')
};
