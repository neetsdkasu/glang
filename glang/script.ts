//
// script
//

import Logger, { LogLevel } from "logger";
const log = new Logger("main", LogLevel.ALL);

import CharReader from "charreader";
import Scanner from "scanner";
import * as parser from "parser";
import * as compiler from "compiler";
import * as U from "utils";

/**
 * UI
 */
const Canvas = document.getElementById("canvas") as HTMLCanvasElement;
const RunButton = document.getElementById("run") as HTMLButtonElement;
const StopButton = document.getElementById("stop") as HTMLButtonElement;
const CodeTextarea = document.getElementById("code") as HTMLTextAreaElement;

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
