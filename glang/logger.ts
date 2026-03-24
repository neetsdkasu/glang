//
// Logger
//

import { callToString } from "utils";

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
    readonly level: LogLevel;
    
    constructor(name: string, level?: LogLevel) {
        this.name = name;
        if (level) {
            this.level = level;
        } else {
            this.level = LogLevel.ERROR;
        }
    }

    dump(msg: string, obj: any): void {
        if (this.level & LogLevel.DEBUG) {
            console.log(`[${this.name}]d: ${msg}: ${obj}`);
        }
    }

    show(msg: string, obj: any): void {
        if (this.level & LogLevel.DEBUG) {
            console.log(`[${this.name}]d: ${msg}: ${callToString(obj)}`);
        }
    }

    info(msg: string): void {
        if (this.level & LogLevel.INFO) {
            console.log(`[${this.name}]i: ${msg}`);
        }
    }

    warn(msg: string): void {
        if (this.level & LogLevel.WARN) {
            console.log(`[${this.name}]w: ${msg}`);
        }
    }

    error(msg: string): void {
        if (this.level & LogLevel.ERROR) {
            console.log(`[${this.name}]E: ${msg}`);
        }
    }
}

export default Logger;
