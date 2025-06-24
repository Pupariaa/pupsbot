const IRCFramework = require("irc-framework");
const Logger = require("../utils/Logger");
class OsuIRCClient {
    constructor({ username, password, channel = "#osu", host = "irc.ppy.sh", port = 6667 }) {
        this.client = new IRCFramework.Client();
        this.channel = channel;

        this.connectionConfig = {
            host,
            port,
            nick: username,
            password,
            auto_reconnect: true
        };
    }

    connect() {
        Logger.irc("Connecting to osu! IRC...");

        this.client.connect(this.connectionConfig);

        this.client.on("registered", () => {
            Logger.irc("Connected to osu! IRC.");
            this.joinChannel(this.channel);
        });

        this.client.on("error", (err) => {
            Logger.ircError(`Connection error: ${err.message}`);
        });

        this.client.on("close", () => {
            Logger.ircError("IRC connection closed.");
        });

        this.client.on("socket error", (err) => {
            Logger.ircError(`Socket error: ${err.message}`);
        });
    }

    joinChannel(channelName) {
        this.client.join(channelName);
        Logger.irc(`Joined channel: ${channelName}`);
    }

    sendMessage(message, target = this.channel) {
        if (!message || typeof message !== "string") return;
        this.client.say(target, message);
    }

    onMessage(callback) {
        this.client.on("privmsg", (event) => {
            if (event.target.toLowerCase() !== this.connectionConfig.nick.toLowerCase()) return;
            if (!event.message.startsWith("!")) return;
            Logger.irc(`← ${event.nick}: ${event.message}`);
            callback(event);
        });
    }
    onAction(callback) {
        this.client.on("action", (event) => {
            if (event.target !== this.connectionConfig.nick) return;
            callback(event);
        });
    }

    getClient() {
        return this.client;
    }
}

module.exports = OsuIRCClient;
