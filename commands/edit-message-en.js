const Logger = require('../utils/Logger');

module.exports = {
    name: 'edit-message-en',
    async execute(event, args, queue, lastRequests, user = null, options = {}) {
        if (!global.autoMessageManager) {
            Logger.service('edit-message-en: AutoMessageManager not initialized');
            return;
        }
        const raw = event.message.replace(/^!\s*edit-message-en\s*/i, '').trim();
        await global.autoMessageManager.handleEditMessageCommand({
            locale: 'en',
            raw,
            event,
            queue,
            receivingBot: options.receivingBot,
            pupsbotIrcSession: options.pupsbotIrcSession
        });
    }
};
