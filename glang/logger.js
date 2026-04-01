//
// Logger
//
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["OFF"] = 0] = "OFF";
    LogLevel[LogLevel["ERROR"] = 1] = "ERROR";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["INFO"] = 4] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 8] = "DEBUG";
    LogLevel[LogLevel["ALL"] = 15] = "ALL";
})(LogLevel || (LogLevel = {}));
export class Logger {
    name;
    #level;
    get level() {
        return this.#level;
    }
    constructor(name, level) {
        this.name = name;
        if (level) {
            this.#level = level;
        }
        else {
            this.#level = LogLevel.ERROR;
        }
    }
    dump(msg, obj, ...args) {
        if (this.#level & LogLevel.DEBUG) {
            if (typeof obj === "function") {
                obj = obj(...args);
            }
            else if (args) {
                obj = `${obj} ${args}`;
            }
            console.log(`[${this.name}]d: ${msg}: ${obj}`);
        }
    }
    info(msg) {
        if (this.#level & LogLevel.INFO) {
            console.log(`[${this.name}]i: ${msg}`);
        }
    }
    warn(msg) {
        if (this.#level & LogLevel.WARN) {
            console.log(`[${this.name}]w: ${msg}`);
        }
    }
    error(msg, obj) {
        if (this.#level & LogLevel.ERROR) {
            console.log(`[${this.name}]E: ${msg}: ${obj}`);
        }
    }
    temp(level, proccess) {
        const saved = this.#level;
        this.#level = level;
        const result = proccess();
        this.#level = saved;
        return result;
    }
}
export default Logger;
