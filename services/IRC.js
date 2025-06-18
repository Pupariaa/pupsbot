const IRCFramework = require("irc-framework");
const winston = require("winston");

class OsuIRCClient {
    constructor({ username, password, channel = "#osu", host = "irc.ppy.sh", port = 6667 }) {
        this.logger = this._initLogger();

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
        this.logger.info("Connecting to osu! IRC...");

        this.client.connect(this.connectionConfig);

        this.client.on("registered", () => {
            this.logger.info("Connected to osu! IRC.");
            this.joinChannel(this.channel);
        });

        this.client.on("error", (err) => {
            this.logger.error(`Connection error: ${err.message}`);
        });

        this.client.on("close", () => {
            this.logger.warn("IRC connection closed.");
        });

        this.client.on("socket error", (err) => {
            this.logger.error(`Socket error: ${err.message}`);
        });
    }

    joinChannel(channelName) {
        this.client.join(channelName);
        this.logger.info(`Joined channel: ${channelName}`);
    }

    sendMessage(message, target = this.channel) {
        if (!message || typeof message !== "string") return;
        this.client.say(target, message);
        // this.logger.debug(`→ ${target}: ${message}`);
    }

    onMessage(callback) {
        this.client.on("privmsg", (event) => {
            if (event.target.toLowerCase() !== this.connectionConfig.nick.toLowerCase()) return;
            if (!event.message.startsWith("!")) return;
            // this.logger.debug(`← ${event.nick}: ${event.message}`);
            callback(event);
        });
    }
    onAction(callback) {
        this.client.on("action", (event) => {
            if (event.target !== this.connectionConfig.nick) return;
            // this.logger.debug(`← ${event.nick}: ${event.message}`);
            callback(event);
        });
    }

    getClient() {
        return this.client;
    }

    _initLogger() {
        return winston.createLogger({
            level: "debug",
            format: winston.format.combine(
                winston.format.colorize({ all: true }),
                winston.format.timestamp({ format: "DD/MM/YYYY HH:mm:ss" }),
                winston.format.printf(({ timestamp, level, message }) => {
                    return `[${timestamp}] ${level}: ${message}`;
                })
            ),
            transports: [
                new winston.transports.Console()
            ],
            exitOnError: false
        });
    }
}

module.exports = OsuIRCClient;
