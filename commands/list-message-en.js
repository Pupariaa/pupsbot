const Logger = require('../utils/Logger');

module.exports = {
    name: 'list-message-en',
    async execute(event, args, queue, lastRequests, user = null, options = {}) {
        if (!global.autoMessageManager) {
            Logger.service('list-message-en: AutoMessageManager not initialized');
            return;
        }
        await global.autoMessageManager.handleListMessageCommand({
            locale: 'en',
            event,
            queue,
            receivingBot: options.receivingBot,
            pupsbotIrcSession: options.pupsbotIrcSession
        });
    }
};
