//
// script
//
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("main", LogLevel.ALL);
import { Token } from "./scanner.js";
import * as runner from "./runner.js";
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
const ctx = Canvas.getContext("bitmaprenderer");
U.assert(ctx !== null);
UU.setEnableTabIndent(CodeTextarea);
function updateStatus(s) {
    StatusSpan.textContent = s;
}
function toggleItemsDisabled() {
    RunButton.disabled = !RunButton.disabled;
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
const pstate = {
    x: 0,
    y: 0,
    kind: runner.PointerStateKind.NONE,
    time: 0
};
function workerOnError(ev) {
    log.error("Worker.onError", ev);
}
function workerOnMessageError(ev) {
    log.error("Worker.onMessageError", ev);
}
function workerOnMessage(ev) {
    Promise.resolve(ev.data)
        .then(sd => {
        switch (sd.kind) {
            case "ParseError":
                {
                    updateStatus("ParseError");
                    toggleItemsDisabled();
                    openErrorDetails(sd.msg, sd.src);
                }
                break;
            case "RuntimeError":
                {
                    updateStatus("RuntimeError");
                    toggleItemsDisabled();
                    openErrorDetails(sd.msg, sd.src);
                }
                break;
            case "Message":
                {
                    updateStatus(sd.message);
                }
                break;
            case "Ready":
                {
                    U.assert(worker !== null);
                    updateStatus("ready");
                    pstate.x = 0;
                    pstate.y = 0;
                    pstate.kind = runner.PointerStateKind.NONE;
                    pstate.time = 0;
                    const cin = CinTextarea.value;
                    const width = Canvas.width;
                    const height = Canvas.height;
                    M.sendGoRun(worker, cin, width, height);
                    StopButton.disabled = false;
                }
                break;
            case "Finished":
                {
                    updateStatus("Finished");
                    toggleItemsDisabled();
                    StopButton.disabled = true;
                }
                break;
            case "WriteCerr":
                {
                    CerrTextarea.value += sd.text + "\n";
                }
                break;
            case "TransferImage":
                {
                    const image = sd.image;
                    ctx.transferFromImageBitmap(image);
                }
                break;
            case "EventOfPointer":
                {
                    U.assert(worker !== null);
                    M.sendEventOfPointer(worker, pstate);
                }
                break;
        }
    });
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
    StopButton.disabled = true;
    Promise.resolve(undefined)
        .then(() => {
        if (worker != null) {
            worker.terminate();
            worker = null;
        }
        updateStatus("Stopped");
        toggleItemsDisabled();
    });
});
RunButton.addEventListener("click", () => {
    toggleItemsDisabled();
    Promise.resolve(undefined)
        .then(() => {
        CoutTextarea.value = "";
        CerrTextarea.value = "";
        const src = CodeTextarea.value;
        M.sendTextSrc(lunchWorker(), src);
    });
});
Canvas.addEventListener("pointerdown", ev => {
    pstate.x = ev.offsetX;
    pstate.y = ev.offsetY;
    pstate.kind = runner.PointerStateKind.DOWN;
    pstate.time = Date.now();
});
Canvas.addEventListener("pointerup", ev => {
    pstate.x = ev.offsetX;
    pstate.y = ev.offsetY;
    pstate.kind = runner.PointerStateKind.UP;
    pstate.time = Date.now();
});
export default {};
