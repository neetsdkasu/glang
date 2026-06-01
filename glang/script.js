//
// script
//
import Logger, { LogLevel } from "logger";
const log = new Logger("main", LogLevel.ALL);
import CharReader from "charreader";
import Scanner from "scanner";
import * as parser from "parser";
import * as compiler from "compiler";
/**
 * UI
 */
const Canvas = document.getElementById("canvas");
const RunButton = document.getElementById("run");
const StopButton = document.getElementById("stop");
const CodeTextarea = document.getElementById("code");
/**
 *
 */
RunButton.addEventListener("click", () => {
    const src = CodeTextarea.value;
    const reader = new CharReader(src);
    const scanner = new Scanner(reader);
    const parsedResult = parser.parse(scanner);
    log.dump("parsedResult", parsedResult);
    if (parsedResult.isErr) {
        return;
    }
    const parsedSrc = parsedResult.result;
    const compiledResult = compiler.compile(parsedSrc);
    log.dump("compiledResult", compiledResult);
});
export default {};
