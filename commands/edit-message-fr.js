const Logger = require('../utils/Logger');

module.exports = {
    name: 'edit-message-fr',
    async execute(event, args, queue, lastRequests, user = null, options = {}) {
        if (!global.autoMessageManager) {
            Logger.service('edit-message-fr: AutoMessageManager not initialized');
            return;
        }
        const raw = event.message.replace(/^!\s*edit-message-fr\s*/i, '').trim();
        await global.autoMessageManager.handleEditMessageCommand({
            locale: 'fr',
            raw,
            event,
            queue,
            receivingBot: options.receivingBot,
            pupsbotIrcSession: options.pupsbotIrcSession
        });
    }
};
