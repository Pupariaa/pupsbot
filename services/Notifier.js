require('dotenv').config();
const axios = require('axios');

class Notifier {
    constructor() {
        this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
        this.ntfyUrl = process.env.NTFY_URL;
        this.ntfyTopic = process.env.NTFY_TOPIC;

        if (!this.discordWebhookUrl || !this.ntfyUrl || !this.ntfyTopic) {
            throw new Error('Notifier misconfigured: missing environment variables');
        }

        this.http = axios.create({
            timeout: 5000
        });
    }

    async send(message, context = 'Alert') {
        const formattedMessage = `⚠️ [${context}] ${message}`;

        const tasks = [
            this.sendDiscord(formattedMessage),
            this.sendNtfy(formattedMessage)
        ];

        await Promise.allSettled(tasks);
    }

    async sendDiscord(message) {
        await this.http.post(this.discordWebhookUrl, {
            content: message
        });
    }

    async sendNtfy(message) {
        const url = `${this.ntfyUrl.replace(/\/$/, '')}/${this.ntfyTopic}`;
        await this.http.post(url, message, {
            headers: {
                Title: 'Pupsbot',
                Priority: 'high'
            }
        });
    }
}

module.exports = Notifier;
