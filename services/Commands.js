const path = require('path');
const fs = require('fs');
const generateId = require('../utils/generateId');
const Logger = require('../utils/Logger');
const { getUser } = require('../services/OsuApiV1');
const Notifier = require('../services/Notifier');
const notifier = new Notifier();

class CommandManager {
    constructor(gameModeManager = null, commandsPath = path.join(__dirname, '..', 'commands')) {
        this.commands = new Map();
        this.gameModeManager = gameModeManager;
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

    async handleMessage(event, queue, lastRequests) {
        const content = event.message;
        const parts = content.slice(1).trim().split(' ');
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        event.id = generateId();
        const command = this.commands.get(commandName);

        if (!command) {
            return this._handleUnknownCommand(commandName, event, queue);
        }

        Logger.task(`Command received: !${commandName} → ${event.id}`);

        try {
            await command.execute(event, args, queue, lastRequests);
        } catch (error) {
            Logger.errorCatch(`CommandManager::${commandName}`, error);
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

    async _handleUnknownCommand(commandName, event, queue) {
        try {
            const user = await getUser(event.nick, event.id);

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
