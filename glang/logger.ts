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

    dump(msg: string, obj: any): void;
    dump(msg: string, argn: number, ...args: any): void;
    dump<T1>(msg: string, func: (a1: T1) => any, a1: T1): void;
    dump<T1,T2>(msg: string, func: (a1: T1, a2: T2) => any, a1: T1, a2: T2): void;
    dump<T1,T2,T3>(msg: string, func: (a1: T1, a2: T2, a3: T3) => any, a1: T1, a2: T2, a3: T3): void;
    dump<T1,T2,T3,T4>(msg: string, func: (a1: T1, a2: T2, a3: T3, a4: T4, ...a5: any) => any, a1: T1, a2: T2, a3: T3, a4: T4, ...a5: any): void;
    
    dump(msg: string, obj: any, ...args: any): void {
        if (this.#level & LogLevel.DEBUG) {
            if (typeof obj === "function") {
                obj = obj(...args);
            } else if (args) {
                obj = `[ ${obj} ]: ${[...args].map( e => `${e}`).join(", ")}`;
            }
            console.log(`[${this.name}]v: ${msg}: ${obj}`);
        }
    }

    debug(msg: string): void {
        if (this.#level & LogLevel.DEBUG) {
            console.log(`[${this.name}]d: ${msg}`);
        }
    }

    info(msg: string): void {
        if (this.#level & LogLevel.INFO) {
            console.log(`[${this.name}]i: ${msg}`);
        }
    }

    warn(msg: string): void {
        if (this.#level & LogLevel.WARN) {
            console.log(`[${this.name}]W: ${msg}`);
        }
    }

    error(msg: string, obj?: object): void {
        if (this.#level & LogLevel.ERROR) {
            if (obj) {
                console.log(`[${this.name}]E: ${msg}: ${obj}`);
            } else {
                console.log(`[${this.name}]E: ${msg}`);
            }
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
