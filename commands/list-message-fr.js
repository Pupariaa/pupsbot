const Logger = require('../utils/Logger');

module.exports = {
    name: 'list-message-fr',
    async execute(event, args, queue, lastRequests, user = null, options = {}) {
        if (!global.autoMessageManager) {
            Logger.service('list-message-fr: AutoMessageManager not initialized');
            return;
        }
        await global.autoMessageManager.handleListMessageCommand({
            locale: 'fr',
            event,
            queue,
            receivingBot: options.receivingBot,
            pupsbotIrcSession: options.pupsbotIrcSession
        });
    }
};
