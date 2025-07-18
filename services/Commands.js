const path = require('path');
const fs = require('fs');
const generateId = require('../utils/generateId');
const Logger = require('../utils/Logger');
const { getUser } = require('../services/OsuApiV1');

class CommandManager {
    constructor(commandsPath = path.join(__dirname, '..', 'commands')) {
        this.commands = new Map();
        this._loadAll(commandsPath);
    }

    _loadAll(directory) {
        try {
            const files = fs.readdirSync(directory).filter(file => file.endsWith('.js'));

            for (const file of files) {
                const filePath = path.join(directory, file);
                const command = require(filePath);

                if (command.name && typeof command.execute === 'function') {
                    this.commands.set(command.name.toLowerCase(), command);
                }
            }
        } catch (err) {
            Logger.errorCatch('CommandManager::_loadAll', err);
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
            let u = await getUser(event.nick);
            await queue.addToQueue(event.nick, u.locale === 'FR' ? `Commande inconnue: !${commandName}. Fait !help pour connaitre les commandes` : `Unknown command: !${commandName}. Do !help to know the commands`, true, event.id, true);
            return;

        };
        Logger.task(`Create: !${commandName} → ${event.id}`);

        try {
            await command.execute(event, args, queue, lastRequests);
        } catch (error) {
            Logger.errorCatch(`CommandManager::${commandName}`, error);
            await queue.addToQueue(event.nick, "An error occurred while executing the command.", true, event.id, false);
        }
    }
}

module.exports = CommandManager;
