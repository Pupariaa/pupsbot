class Logger {
    static _now() {
        const d = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        return `${date} ${time}`;
    }

    static _log(color, label, message) {
        const timestamp = this._now();
        console.log(`${color}[${timestamp}] [${label}] ${message}\x1b[0m`);
    }

    static service(message) {
        this._log('\x1b[94m', 'Service', message);
    }

    static irc(message) {
        this._log('\x1b[36m', 'IRC', message);
    }

    static ircError(message) {
        this._log('\x1b[31m', 'IRC ERROR', message);
    }

    static queue(message) {
        this._log('\x1b[33m', 'Queue', message);
    }

    static task(message) {
        this._log('\x1b[32m', 'Task', message);
    }
    static taskRejected(message) {
        this._log('\x1b[33m', 'Task Rejected', message);
    }

    static taskError(message) {
        this._log('\x1b[31m', 'Task Error', message);
    }
    static errorCatch(context, error) {
        const timestamp = this._now?.() || new Date().toISOString();
        const message = error?.stack || error?.message || String(error);
        console.error(`\x1b[31m[${timestamp}] [Error] [${context}] ${message}\x1b[0m`);
    }
}

module.exports = Logger;