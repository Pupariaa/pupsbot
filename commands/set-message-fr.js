const Logger = require('../utils/Logger');

module.exports = {
    name: 'set-message-fr',
    async execute(event, args, queue, lastRequests, user = null, options = {}) {
        if (!global.autoMessageManager) {
            Logger.service('set-message-fr: AutoMessageManager not initialized');
            return;
        }
        const raw = event.message.replace(/^!\s*set-message-fr\s*/i, '').trim();
        await global.autoMessageManager.handleSetMessageCommand({
            locale: 'fr',
            raw,
            event,
            queue,
            receivingBot: options.receivingBot,
            pupsbotIrcSession: options.pupsbotIrcSession
        });
    }
};
