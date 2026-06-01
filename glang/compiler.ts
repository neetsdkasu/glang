//
// Compiler
//
import Logger, { LogLevel } from "logger";
const log = new Logger("compiler", LogLevel.ALL);

import * as C from "code";
import { Cmd } from "command";
import { Result } from "utils";

export type CompileError = string;

class Compiler {
    readonly src: C.ParsedSource;

    constructor(src: C.ParsedSource) {
        this.src = src;
    }



}

export function compile(src: C.ParsedSource): Result<undefined,CompileError> {
    return Result.ok(undefined);
}

export default {};
