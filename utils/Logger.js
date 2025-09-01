const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logLevels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };
        this.currentLevel = this.logLevels.INFO;
        this.logFile = path.join(process.cwd(), 'logs', 'application.log');
        this._ensureLogDir();
    }

    _ensureLogDir() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    _now() {
        const d = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const ms = d.getMilliseconds().toString().padStart(3, '0');
        const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
        return `${date} ${time}`;
    }

    _sanitizeMessage(message) {
        if (typeof message !== 'string') {
            message = String(message);
        }
        
        return message
            .replace(/password[=:]\s*[\w\S]+/gi, 'password=***')
            .replace(/token[=:]\s*[\w\S]+/gi, 'token=***')
            .replace(/key[=:]\s*[\w\S]+/gi, 'key=***')
            .replace(/secret[=:]\s*[\w\S]+/gi, 'secret=***')
            .replace(/authorization:\s*[\w\S]+/gi, 'authorization: ***')
            .replace(/bearer\s+[\w\S]+/gi, 'bearer ***')
            .replace(/api[_-]?key[=:]\s*[\w\S]+/gi, 'api_key=***');
    }

    _log(level, category, message, metadata = {}) {
        const timestamp = this._now();
        const sanitizedMessage = this._sanitizeMessage(message);
        const logEntry = {
            timestamp,
            level,
            category,
            message: sanitizedMessage,
            pid: process.pid,
            ...metadata
        };

        const colors = {
            ERROR: '\x1b[31m',
            WARN: '\x1b[33m',
            INFO: '\x1b[36m',
            DEBUG: '\x1b[35m',
            SUCCESS: '\x1b[32m'
        };

        const color = colors[level] || '\x1b[37m';
        const consoleOutput = `${color}[${timestamp}] [${level}] [${category}] ${sanitizedMessage}\x1b[0m`;

        console.log(consoleOutput);

        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            fs.appendFileSync(this.logFile, logLine, 'utf8');
        } catch (err) {
            console.error('Failed to write to log file:', err.message);
        }
    }

    error(category, message, error = null) {
        const metadata = {};
        if (error) {
            metadata.error = {
                message: error.message,
                stack: error.stack,
                name: error.name
            };
        }
        this._log('ERROR', category, message, metadata);
    }

    warn(category, message, metadata = {}) {
        this._log('WARN', category, message, metadata);
    }

    info(category, message, metadata = {}) {
        this._log('INFO', category, message, metadata);
    }

    debug(category, message, metadata = {}) {
        if (this.currentLevel >= this.logLevels.DEBUG) {
            this._log('DEBUG', category, message, metadata);
        }
    }

    success(category, message, metadata = {}) {
        this._log('SUCCESS', category, message, metadata);
    }

    static service(message) {
        const logger = new Logger();
        logger.info('SERVICE', message);
    }

    static redis(message) {
        const logger = new Logger();
        logger.info('REDIS', message);
    }

    static redisErr(message, error = null) {
        const logger = new Logger();
        logger.error('REDIS', message, error);
    }

    static irc(message) {
        const logger = new Logger();
        logger.info('IRC', message);
    }

    static ircError(message, error = null) {
        const logger = new Logger();
        logger.error('IRC', message, error);
    }

    static queue(message) {
        const logger = new Logger();
        logger.info('QUEUE', message);
    }

    static task(message) {
        const logger = new Logger();
        logger.info('TASK', message);
    }

    static taskRejected(message) {
        const logger = new Logger();
        logger.warn('TASK', `Rejected: ${message}`);
    }

    static taskError(message, error = null) {
        const logger = new Logger();
        logger.error('TASK', message, error);
    }

    static track(message) {
        const logger = new Logger();
        logger.info('TRACKER', message);
    }

    static trackSuccess(message) {
        const logger = new Logger();
        logger.success('TRACKER', message);
    }

    static errorCatch(context, error) {
        const logger = new Logger();
        logger.error(context, 'Unhandled error caught', error);
    }

    static api(method, url, status, duration, metadata = {}) {
        const logger = new Logger();
        const message = `${method} ${url} - ${status} (${duration}ms)`;
        if (status >= 400) {
            logger.error('API', message, metadata);
        } else {
            logger.info('API', message, metadata);
        }
    }

    static security(event, details, metadata = {}) {
        const logger = new Logger();
        logger.warn('SECURITY', `${event}: ${details}`, metadata);
    }

    static performance(operation, duration, metadata = {}) {
        const logger = new Logger();
        const message = `${operation} completed in ${duration}ms`;
        if (duration > 1000) {
            logger.warn('PERFORMANCE', message, metadata);
        } else {
            logger.info('PERFORMANCE', message, metadata);
        }
    }
}

module.exports = Logger;