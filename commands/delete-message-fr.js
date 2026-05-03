const Logger = require('../utils/Logger');

module.exports = {
    name: 'delete-message-fr',
    async execute(event, args, queue, lastRequests, user = null, options = {}) {
        if (!global.autoMessageManager) {
            Logger.service('delete-message-fr: AutoMessageManager not initialized');
            return;
        }
        const raw = event.message.replace(/^!\s*delete-message-fr\s*/i, '').trim();
        await global.autoMessageManager.handleDeleteMessageCommand({
            locale: 'fr',
            raw,
            event,
            queue,
            receivingBot: options.receivingBot,
            pupsbotIrcSession: options.pupsbotIrcSession
        });
    }
};
