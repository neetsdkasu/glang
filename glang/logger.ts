//
// Logger
//

export enum LogLevel {
    OFF   = 0,
    ERROR = 1 << 0,
    WARN  = 1 << 1,
    INFO  = 1 << 2,
    DEBUG = 1 << 3,
    ALL = ERROR | WARN | INFO | DEBUG
}

export class Logger {
    readonly name: string;
    #level: LogLevel;

    get level(): LogLevel {
        return this.#level;
    }
    
    constructor(name: string, level?: LogLevel) {
        this.name = name;
        if (level) {
            this.#level = level;
        } else {
            this.#level = LogLevel.ERROR;
        }
    }

    dump(msg: string, obj: any, ...args: any): void {
        if (this.#level & LogLevel.DEBUG) {
            if (typeof obj === "function") {
                obj = obj(...args);
            } else if (args) {
                obj = `${obj} ${args}`;
            }
            console.log(`[${this.name}]d: ${msg}: ${obj}`);
        }
    }

    info(msg: string): void {
        if (this.#level & LogLevel.INFO) {
            console.log(`[${this.name}]i: ${msg}`);
        }
    }

    warn(msg: string): void {
        if (this.#level & LogLevel.WARN) {
            console.log(`[${this.name}]w: ${msg}`);
        }
    }

    error(msg: string, obj?: object): void {
        if (this.#level & LogLevel.ERROR) {
            console.log(`[${this.name}]E: ${msg}: ${obj}`);
        }
    }

    temp<T>(level: LogLevel, proccess: () => T): T {
        const saved = this.#level;
        this.#level = level;
        const result = proccess();
        this.#level = saved;
        return result;
    }
}

export default Logger;
