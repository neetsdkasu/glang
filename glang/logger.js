//
// Logger
//
import { callToString } from "utils";
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
        if (this.#level & LogLevel.DEBUG) {
            console.log(`[${this.#name}]d: ${msg}: ${obj}`);
        }
    }
    show(msg, obj) {
        if (this.#level & LogLevel.DEBUG) {
            console.log(`[${this.#name}]d: ${msg}: ${callToString(obj)}`);
        }
    }
    info(msg) {
        if (this.#level & LogLevel.INFO) {
            console.log(`[${this.#name}]i: ${msg}`);
        }
    }
    warn(msg) {
        if (this.#level & LogLevel.WARN) {
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
