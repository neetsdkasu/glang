//
// script
//
import Logger, { LogLevel } from "logger";
const log = new Logger("main", LogLevel.ALL);
import CharReader from "charreader";
import Scanner from "scanner";
import Parser from "parser";
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
    const parser = new Parser(scanner);
    parser.parse();
});
export default {};
