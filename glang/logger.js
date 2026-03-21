//
// Logger
//
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["OFF"] = 0] = "OFF";
    LogLevel[LogLevel["ERROR"] = 1] = "ERROR";
    LogLevel[LogLevel["WARNING"] = 2] = "WARNING";
    LogLevel[LogLevel["INFO"] = 4] = "INFO";
    LogLevel[LogLevel["DUMP"] = 8] = "DUMP";
    LogLevel[LogLevel["ALL"] = 15] = "ALL";
})(LogLevel || (LogLevel = {}));
export class Logger {
    #name;
    #level;
    constructor(name, level) {
        this.#name = name;
        if (level) {
            this.#level = level;
        }
        else {
            this.#level = LogLevel.ERROR;
        }
    }
    dump(msg, obj) {
        if (this.#level & LogLevel.DUMP) {
            console.log(`[${this.#name}]d: ${msg}: ${obj}`);
        }
    }
    info(msg) {
        if (this.#level & LogLevel.INFO) {
            console.log(`[${this.#name}]i: ${msg}`);
        }
    }
    warn(msg) {
        if (this.#level & LogLevel.WARNING) {
            console.log(`[${this.#name}]w: ${msg}`);
        }
    }
    error(msg) {
        if (this.#level & LogLevel.ERROR) {
            console.log(`[${this.#name}]E: ${msg}`);
        }
    }
}
export default Logger;
