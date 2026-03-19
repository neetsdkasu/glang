import Logger from "logger";
const log = new Logger("main");
import CharReader from "charreader";
import Scanner from "scanner";
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
    while (scanner.scan()) {
        log.dump("scan", scanner.token?.toString());
    }
});
export default {};
