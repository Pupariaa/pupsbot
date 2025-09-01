const Logger = require('./Logger');
const UserFacingError = require('./UserFacingError');

const logger = new Logger();

class ErrorHandler {
    constructor() {
        this.errorCounts = new Map();
        this.rateLimits = new Map();
        this.maxErrorsPerMinute = 10;
    }

    shouldSuppressError(errorKey) {
        const now = Date.now();
        const minute = Math.floor(now / 60000);
        const key = `${errorKey}_${minute}`;
        
        const count = this.errorCounts.get(key) || 0;
        if (count >= this.maxErrorsPerMinute) {
            return true;
        }
        
        this.errorCounts.set(key, count + 1);
        
        setTimeout(() => {
            this.errorCounts.delete(key);
        }, 60000);
        
        return false;
    }

    handleError(error, context, metadata = {}) {
        const errorKey = `${context}_${error.name}`;
        
        if (this.shouldSuppressError(errorKey)) {
            logger.debug('ERROR_HANDLER', `Suppressed repeated error: ${errorKey}`);
            return;
        }

        const sanitizedError = this.sanitizeError(error);
        logger.error(context, sanitizedError.message, sanitizedError);

        if (error.critical) {
            process.exit(1);
        }
    }

    sanitizeError(error) {
        if (!error) return { message: 'Unknown error', stack: '' };

        const sensitivePatterns = [
            /password[=:]\s*[\w\S]+/gi,
            /token[=:]\s*[\w\S]+/gi,
            /key[=:]\s*[\w\S]+/gi,
            /secret[=:]\s*[\w\S]+/gi,
            /authorization:\s*[\w\S]+/gi,
            /bearer\s+[\w\S]+/gi
        ];

        let message = error.message || 'Unknown error';
        let stack = error.stack || '';

        for (const pattern of sensitivePatterns) {
            message = message.replace(pattern, '[REDACTED]');
            stack = stack.replace(pattern, '[REDACTED]');
        }

        return {
            name: error.name,
            message,
            stack,
            code: error.code,
            status: error.status
        };
    }

    createUserError(message, locale = 'EN', errorCode = 'GENERIC_ERROR') {
        return new UserFacingError(message, locale, errorCode);
    }

    wrapApiCall(apiFunction, context, retries = 3, backoffMs = 1000) {
        return async (...args) => {
            let lastError;
            
            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    const startTime = Date.now();
                    const result = await apiFunction(...args);
                    const duration = Date.now() - startTime;
                    
                    logger.info(`${context}_API_CALL`, `API call completed in ${duration}ms`, {
                        attempt: attempt + 1,
                        success: true,
                        duration
                    });
                    
                    return result;
                } catch (error) {
                    lastError = error;
                    
                    if (attempt === retries - 1) {
                        this.handleError(error, context, {
                            attempt: attempt + 1,
                            maxRetries: retries,
                            args: this.sanitizeArgs(args)
                        });
                        throw error;
                    }
                    
                    const waitTime = backoffMs * Math.pow(2, attempt);
                    logger.warn(context, `API call failed, retrying in ${waitTime}ms`, {
                        attempt: attempt + 1,
                        error: this.sanitizeError(error)
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
            
            throw lastError;
        };
    }

    sanitizeArgs(args) {
        return args.map(arg => {
            if (typeof arg === 'string') {
                return arg.replace(/[a-zA-Z0-9]{20,}/g, '[TOKEN]');
            }
            if (typeof arg === 'object' && arg !== null) {
                const sanitized = { ...arg };
                for (const key of Object.keys(sanitized)) {
                    if (/password|token|key|secret|auth/i.test(key)) {
                        sanitized[key] = '[REDACTED]';
                    }
                }
                return sanitized;
            }
            return arg;
        });
    }

    validateEnvironment() {
        const required = ['OSU_API_KEY', 'IRC_USERNAME', 'IRC_PASSWORD'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            const error = new Error(`Missing required environment variables: ${missing.join(', ')}`);
            error.critical = true;
            throw error;
        }
        
        logger.info('ERROR_HANDLER', 'Environment validation passed');
    }

    setupGlobalHandlers() {
        process.on('uncaughtException', (error) => {
            this.handleError(error, 'UNCAUGHT_EXCEPTION', { critical: true });
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            this.handleError(error, 'UNHANDLED_REJECTION', { 
                promise: promise.toString() 
            });
        });

        process.on('SIGTERM', () => {
            logger.info('ERROR_HANDLER', 'Received SIGTERM, shutting down gracefully');
            process.exit(0);
        });

        process.on('SIGINT', () => {
            logger.info('ERROR_HANDLER', 'Received SIGINT, shutting down gracefully');
            process.exit(0);
        });
    }
}

module.exports = ErrorHandler;