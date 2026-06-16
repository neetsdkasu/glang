//
// script
//
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("main", LogLevel.ALL);
import { Token } from "./scanner.js";
import * as U from "./utils.js";
import * as UU from "./uiutils.js";
import * as M from "./mes.js";
/**
 * UI
 */
const Canvas = document.getElementById("canvas");
const RunButton = document.getElementById("run");
const StopButton = document.getElementById("stop");
const StatusSpan = document.getElementById("status");
const CodeTextarea = document.getElementById("code");
const CerrTextarea = document.getElementById("cerr");
const CinTextarea = document.getElementById("cin");
const CoutTextarea = document.getElementById("cout");
const StepInput = document.getElementById("step");
UU.setEnableTabIndent(CodeTextarea);
const DEFAULT_STEP_SIZE = 100;
let stepSize = DEFAULT_STEP_SIZE;
StepInput.value = `${DEFAULT_STEP_SIZE}`;
function updateStatus(s) {
    StatusSpan.textContent = s;
}
function toggleItemDisabled() {
    RunButton.disabled = !RunButton.disabled;
    StopButton.disabled = !StopButton.disabled;
    StepInput.disabled = !StepInput.disabled;
    CinTextarea.disabled = !CinTextarea.disabled;
    CodeTextarea.disabled = !CodeTextarea.disabled;
}
function openErrorDetails(msg, src) {
    document.querySelectorAll("details.errcatch").forEach(e => void (e.open = true));
    if (src !== null) {
        document.querySelector("details.srcholder").open = true;
        CodeTextarea.focus();
        if (M.isITokenList(src)) {
            CodeTextarea.setSelectionRange(src[0].start, src.at(-1).end);
            msg += ` ( ${src[0].row + 1}行目 "${Token.lineToString(src)}" )`;
        }
        else {
            CodeTextarea.setSelectionRange(src.start, src.end);
            msg += ` ( ${src.row + 1}行目 ${src.col}文字目 "${src.value}" )`;
        }
    }
    const start = CerrTextarea.textLength;
    CerrTextarea.value += msg;
    const end = CerrTextarea.textLength - 1;
    if (src === null) {
        CerrTextarea.focus();
        CerrTextarea.setSelectionRange(start, end);
    }
}
let worker = null;
function workerOnError(ev) {
    log.error("Worker.onError", ev);
}
function workerOnMessageError(ev) {
    log.error("Worker.onMessageError", ev);
}
function workerOnMessage(ev) {
    const sd = ev.data;
    switch (sd.kind) {
        case "ParseError":
            updateStatus("ParseError");
            toggleItemDisabled();
            openErrorDetails(sd.msg, sd.src);
            break;
        case "RuntimeError":
            updateStatus("RuntimeError");
            toggleItemDisabled();
            openErrorDetails(sd.msg, sd.src);
            break;
        case "Message":
            updateStatus(sd.message);
            break;
        case "Ready":
            updateStatus("ready");
            M.send(worker, { kind: "GoRun", stepSize: stepSize });
            break;
        case "Finished":
            updateStatus("Finished");
            toggleItemDisabled();
            break;
        case "Stop":
            updateStatus("Stopped");
            toggleItemDisabled();
            break;
        case "WriteCerr":
            CerrTextarea.value += sd.text + "\n";
            break;
    }
}
function lunchWorker() {
    if (worker === null) {
        const url = new URL("./worker.js", import.meta.url);
        worker = new Worker(url, { "type": "module" });
        worker.onerror = workerOnError;
        worker.onmessageerror = workerOnMessageError;
        worker.onmessage = workerOnMessage;
    }
    return worker;
}
StopButton.addEventListener("click", () => {
    if (stepSize === 0) {
        if (worker != null) {
            worker.terminate();
            worker = null;
        }
        updateStatus("Stopped");
        toggleItemDisabled();
    }
    else if (worker !== null) {
        M.send(worker, { kind: "Stop" });
    }
});
RunButton.addEventListener("click", () => {
    CoutTextarea.value = "";
    CerrTextarea.value = "";
    stepSize = U.parseIntWithDefault(StepInput.value, DEFAULT_STEP_SIZE);
    const src = CodeTextarea.value;
    M.sendTextSrc(lunchWorker(), src);
    toggleItemDisabled();
});
export default {};
