//
// Logger
//

export enum LogLevel {
    OFF     = 0,
    ERROR   = 1 << 0,
    WARNING = 1 << 1,
    INFO    = 1 << 2,
    DUMP    = 1 << 3,
    ALL = ERROR | WARNING | INFO | DUMP
}

export class Logger {
    #name: string;
    #level: LogLevel;
    
    constructor(name: string, level?: LogLevel) {
        this.#name = name;
        if (level) {
            this.#level = level;
        } else {
            this.#level = LogLevel.ERROR;
        }
    }

    dump(msg: string, obj: any): void {
        if (this.#level & LogLevel.DUMP) {
            console.log(`[${this.#name}]d: ${msg}: ${obj}`);
        }
    }

    info(msg: string): void {
        if (this.#level & LogLevel.INFO) {
            console.log(`[${this.#name}]i: ${msg}`);
        }
    }

    warn(msg: string): void {
        if (this.#level & LogLevel.WARNING) {
            console.log(`[${this.#name}]w: ${msg}`);
        }
    }

    error(msg: string): void {
        if (this.#level & LogLevel.ERROR) {
            console.log(`[${this.#name}]E: ${msg}`);
        }
    }
}

export default Logger;
