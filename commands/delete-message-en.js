const Logger = require('../utils/Logger');

module.exports = {
    name: 'delete-message-en',
    async execute(event, args, queue, lastRequests, user = null, options = {}) {
        if (!global.autoMessageManager) {
            Logger.service('delete-message-en: AutoMessageManager not initialized');
            return;
        }
        const raw = event.message.replace(/^!\s*delete-message-en\s*/i, '').trim();
        await global.autoMessageManager.handleDeleteMessageCommand({
            locale: 'en',
            raw,
            event,
            queue,
            receivingBot: options.receivingBot,
            pupsbotIrcSession: options.pupsbotIrcSession
        });
    }
};
