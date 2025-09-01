const IRCFramework = require("irc-framework");
const Logger = require("../utils/Logger");

class OsuIRCClient {
    constructor({
        username,
        password,
        channel = "#osu",
        host = "irc.ppy.sh",
        port = 6697,
        maxRetries = 5,
        retryDelayMs = 5000
    }, notifier) {
        this.client = new IRCFramework.Client();
        this.channel = channel;
        this.notifier = notifier;

        // IRC ne supporte pas les espaces dans les nicks, on les remplace par des underscores
        const cleanNick = username.replace(/\s+/g, '_');
        
        this.connectionConfig = {
            host,
            port: 6667, // Utiliser le port non-SSL qui fonctionne
            nick: cleanNick,
            username: cleanNick,
            realname: username,
            password,
            tls: false,
            auto_reconnect: false,
            ping_interval: 30,
            ping_timeout: 120
        };

        this.maxRetries = maxRetries;
        this.retryDelayMs = retryDelayMs;
        this.retryCount = 0;

        this._handlersBound = false;
    }

    async connect() {
        Logger.irc(`Connecting to osu! IRC at ${this.connectionConfig.host}:${this.connectionConfig.port} as ${this.connectionConfig.nick} (TLS: ${this.connectionConfig.tls})`);

        if (!this._handlersBound) {
            this._bindEventHandlers();
        }

        try {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout after 15 seconds'));
                }, 15000);

                this.client.once('registered', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.client.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });

                this.client.connect(this.connectionConfig);
            });
        } catch (error) {
            Logger.ircError(`Initial connection error: ${error.message}`);
            await this._handleConnectionFailure(error);
            throw error;
        }
    }

    _bindEventHandlers() {
        this.client.on("registered", async () => {
            Logger.irc(`Successfully registered to osu! IRC as ${this.connectionConfig.nick}`);
            this.joinChannel(this.channel);
            this.retryCount = 0;
            await this.notifier.send("Bot successfully connected to osu! IRC", "IRC.REGISTERED");
        });

        this.client.on("connecting", () => {
            Logger.irc("Attempting to connect to IRC server...");
        });

        this.client.on("connected", () => {
            Logger.irc("TCP connection established to IRC server");
        });

        this.client.on("error", async (error) => {
            Logger.ircError(`IRC error: ${error.message}`);
            await this.notifier.send(`IRC connection error: ${error.message}`, "IRC.ERROR");
        });

        this.client.on("socket error", async (error) => {
            Logger.ircError(`Socket error: ${error.message}`);
            await this.notifier.send(`Socket error on IRC connection: ${error.message}`, "IRC.SOCKET");
        });

        this.client.on("close", async (reason) => {
            Logger.ircError(`IRC connection was closed. Reason: ${reason || 'Unknown'}`);
            await this.notifier.send(`IRC connection closed: ${reason || 'Unknown'}. Attempting to reconnect...`, "IRC.DISCONNECTED");
            await this._attemptReconnect();
        });

        this.client.on("raw", (line) => {
            if (line.command === 'ERROR') {
                Logger.ircError(`IRC server error: ${line.params ? line.params.join(' ') : 'Unknown error'}`);
            }
        });

        this._handlersBound = true;
    }

    async _attemptReconnect() {
        while (this.retryCount < this.maxRetries) {
            this.retryCount++;
            Logger.irc(`Reconnection attempt ${this.retryCount}/${this.maxRetries}...`);

            try {
                this.client.connect(this.connectionConfig);
                await this.notifier.send("IRC reconnection successful", "IRC.RECONNECTED");
                return;
            } catch (error) {
                Logger.ircError(`Reconnect attempt failed: ${error.message}`);
                await this._delay(this.retryDelayMs);
            }
        }

        await this._handleConnectionFailure(new Error("Maximum reconnection attempts reached"));
    }

    async _handleConnectionFailure(error) {
        Logger.ircError(`Failed to reconnect: ${error.message}`);
        await this.notifier.send(
            `Failed to reconnect to IRC after ${this.maxRetries} attempts.\nReason: ${error.message}`,
            "IRC.FATAL"
        );
    }

    joinChannel(channelName) {
        this.client.join(channelName);
        Logger.irc(`Joined IRC channel: ${channelName}`);
    }

    sendMessage(message, target = this.channel) {
        if (typeof message !== "string" || message.length === 0) return;
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

    onClose(callback) {
        this.client.on("close", () => {
            callback(true);
        });
    }

    getClient() {
        return this.client;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = OsuIRCClient;
