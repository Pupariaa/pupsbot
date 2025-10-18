const path = require('path');
const fs = require('fs');
const generateId = require('../utils/generateId');
const Logger = require('../utils/Logger');
const Notifier = require('../services/Notifier');
const notifier = new Notifier();

class CommandManager {
    constructor(commandsPath = path.join(__dirname, '..', 'commands')) {
        this.commands = new Map();
        this._loadAllCommands(commandsPath);
    }

    _loadAllCommands(directory) {
        try {
            const files = fs.readdirSync(directory).filter(file => file.endsWith('.js'));

            for (const file of files) {
                const filePath = path.join(directory, file);
                const command = require(filePath);

                if (command.name && typeof command.execute === 'function') {
                    this.commands.set(command.name.toLowerCase(), command);
                }
            }
        } catch (error) {
            Logger.errorCatch('CommandManager::_loadAllCommands', error);
            notifier.send(`Failed to load commands: ${error.message}`, 'COMMANDS.LOAD_FAIL');
        }
    }

    async handleMessage(event, queue, lastRequests, user = null) {
        const content = event.message;
        const parts = content.slice(1).trim().split(' ');
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        event.id = generateId();
        const command = this.commands.get(commandName);

        if (!command) {
            return this._handleUnknownCommand(commandName, event, queue, user);
        }

        Logger.task(`Command received: !${commandName} → ${event.id}`);

        try {
            await command.execute(event, args, queue, lastRequests, user);
        } catch (error) {
            Logger.errorCatch(`CommandManager::${commandName}`, error);

            // Check if it's a connection error and send appropriate message
            if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' ||
                error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' ||
                error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH' ||
                error.message.includes('ECONNRESET') || error.message.includes('ECONNREFUSED')) {

                const errorMessage = error.message.includes('Redis') || error.message.includes('redis') ?
                    'Service temporarily unavailable (Redis). Please try again in a few moments.' :
                    'Service temporarily unavailable (Database). Please try again in a few moments.';

                await queue.addToQueue(event.nick, errorMessage, true, event.id, false);
                Logger.service(`Connection error detected, sent error message to ${event.nick}`);
                return;
            }

            await notifier.send(
                `Error while executing !${commandName} from ${event.nick}: ${error.message}`,
                `COMMANDS.EXEC_${commandName.toUpperCase()}`
            );

            await queue.addToQueue(
                event.nick,
                "An error occurred while executing the command.",
                true,
                event.id,
                false
            );
        }
    }

    async _handleUnknownCommand(commandName, event, queue, user = null) {
        try {
            if (!user) {
                user = await global.osuApiClient.getUser(event.nick);
            }

            const unknownMessage =
                user?.locale === 'FR'
                    ? `Commande inconnue : !${commandName}. Tape !help pour voir les commandes.`
                    : `Unknown command: !${commandName}. Type !help to see available commands.`;

            await queue.addToQueue(event.nick, unknownMessage, true, event.id, true);
        } catch (error) {
            Logger.errorCatch('CommandManager::UnknownCommandFallback', error);

            await notifier.send(
                `Failed to get user for unknown command (!${commandName}) from ${event.nick}: ${error.message}`,
                'COMMANDS.UNKNOWN_FAIL'
            );

            await queue.addToQueue(
                event.nick,
                `Unknown command: !${commandName}`,
                true,
                event.id,
                true
            );
        }
    }
}

module.exports = CommandManager;
