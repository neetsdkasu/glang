import Logger from "logger";
const log = new Logger("main");

import CharReader from "charreader";
import Scanner from "scanner";
import Parser from "parser";

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
    const parser = new Parser(scanner);

    parser.parse();

});


export default {};
