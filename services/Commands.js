const path = require('path');
const fs = require('fs')
class CommandManager {
    constructor(commandsPath = path.join(__dirname, '..', 'commands')) {
        this.commands = new Map();
        this._loadAll(commandsPath);
    }

    _loadAll(directory) {
        const files = fs.readdirSync(directory).filter(file => file.endsWith('.js'));

        for (const file of files) {
            const filePath = path.join(directory, file);
            const command = require(filePath);

            if (command.name && typeof command.execute === 'function') {
                this.commands.set(command.name.toLowerCase(), command);
            }
        }
    }

    async handleMessage(event, queue, lastRequests) {
        const content = event.message;

        const parts = content.slice(1).trim().split(' ');
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        const command = this.commands.get(commandName);
        if (!command) return;

        try {
            await command.execute(event, args, queue, lastRequests);
        } catch (error) {
            console.error(`${new Date().toLocaleString('fr-FR')} ${event.id} [Command Error] ${commandName}:`, error);
            await queue.addToQueue(event.nick, "An error occurred while executing the command.");
        }
    }
}
module.exports = CommandManager;