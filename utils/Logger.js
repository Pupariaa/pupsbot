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
        this.logDir = path.join(process.cwd(), 'logs');
        this.maxFileSize = 20 * 1024 * 1024; // 20MB
        this._ensureLogDir();
        this._initializeLogFiles();
    }

    _ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    _initializeLogFiles() {
        const timestamp = this._getTimestamp();
        this.applicationLogFile = path.join(this.logDir, `application-${timestamp}.log`);
        this.errorLogFile = path.join(this.logDir, `error-${timestamp}.log`);
    }

    _getTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}-${hour}-${minute}`;
    }

    _shouldRotateLog(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return stats.size >= this.maxFileSize;
        } catch (error) {
            return false;
        }
    }

    _rotateLog(filePath) {
        const timestamp = this._getTimestamp();
        const ext = path.extname(filePath);
        const base = path.basename(filePath, ext);
        const dir = path.dirname(filePath);
        const rotatedPath = path.join(dir, `${base}-${timestamp}${ext}`);

        try {
            fs.renameSync(filePath, rotatedPath);
        } catch (error) {
            console.error('Failed to rotate log file:', error.message);
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

        // Couleurs par type d'opération
        let color = '\x1b[37m'; // Blanc par défaut

        if (sanitizedMessage.includes('[CACHE-HIT]')) {
            color = '\x1b[32m'; // Vert pour cache hit
        } else if (sanitizedMessage.includes('[API-CALL]')) {
            color = '\x1b[34m'; // Bleu pour API call
        } else if (sanitizedMessage.includes('[BACKGROUND]')) {
            color = '\x1b[33m'; // Jaune pour background
        } else if (sanitizedMessage.includes('[WORKER]')) {
            color = '\x1b[35m'; // Magenta pour worker
        } else if (sanitizedMessage.includes('[COMMAND]')) {
            color = '\x1b[36m'; // Cyan pour command
        } else if (sanitizedMessage.includes('[V2-CACHE]')) {
            color = '\x1b[32m'; // Vert pour V2 cache
        } else if (sanitizedMessage.includes('[V2-API]')) {
            color = '\x1b[34m'; // Bleu pour V2 API
        } else if (sanitizedMessage.includes('[V2-SAVE]')) {
            color = '\x1b[32m'; // Vert pour V2 save
        } else if (sanitizedMessage.includes('[CACHE-SAVE]')) {
            color = '\x1b[32m'; // Vert pour cache save
        } else if (sanitizedMessage.includes('[API-RESPONSE]')) {
            color = '\x1b[34m'; // Bleu pour API response
        } else if (sanitizedMessage.includes('[BACKGROUND-RESPONSE]')) {
            color = '\x1b[33m'; // Jaune pour background response
        } else if (sanitizedMessage.includes('[BACKGROUND-UPDATE]')) {
            color = '\x1b[33m'; // Jaune pour background update
        } else {
            // Couleurs par niveau de log
            const levelColors = {
                ERROR: '\x1b[31m',
                WARN: '\x1b[33m',
                INFO: '\x1b[37m',
                DEBUG: '\x1b[35m',
                SUCCESS: '\x1b[32m'
            };
            color = levelColors[level] || '\x1b[37m';
        }

        const consoleOutput = `${color}[${timestamp}] [${level}] [${category}] ${sanitizedMessage}\x1b[0m`;

        console.log(consoleOutput);

        try {
            const logLine = JSON.stringify(logEntry) + '\n';

            if (this._shouldRotateLog(this.applicationLogFile)) {
                this._rotateLog(this.applicationLogFile);
            }
            fs.appendFileSync(this.applicationLogFile, logLine, 'utf8');
            if (level === 'ERROR') {
                if (this._shouldRotateLog(this.errorLogFile)) {
                    this._rotateLog(this.errorLogFile);
                }
                fs.appendFileSync(this.errorLogFile, logLine, 'utf8');
            }
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