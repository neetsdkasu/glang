//
// Compiler
//
import Logger, { LogLevel } from "logger";
const log = new Logger("compiler", LogLevel.ALL);
import { Result } from "utils";
class Compiler {
    src;
    constructor(src) {
        this.src = src;
    }
}
export function compile(src) {
    return Result.ok(undefined);
}
export default {};
