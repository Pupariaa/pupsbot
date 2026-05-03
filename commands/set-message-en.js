const Logger = require('../utils/Logger');

module.exports = {
    name: 'set-message-en',
    async execute(event, args, queue, lastRequests, user = null, options = {}) {
        if (!global.autoMessageManager) {
            Logger.service('set-message-en: AutoMessageManager not initialized');
            return;
        }
        const raw = event.message.replace(/^!\s*set-message-en\s*/i, '').trim();
        await global.autoMessageManager.handleSetMessageCommand({
            locale: 'en',
            raw,
            event,
            queue,
            receivingBot: options.receivingBot,
            pupsbotIrcSession: options.pupsbotIrcSession
        });
    }
};
