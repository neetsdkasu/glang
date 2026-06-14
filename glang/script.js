//
// script
//
import Logger, { LogLevel } from "logger";
const log = new Logger("main", LogLevel.ALL);
import CharReader from "charreader";
import Scanner, { Token } from "scanner";
import * as parser from "parser";
import * as compiler from "compiler";
import Runner from "runner";
import * as U from "utils";
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
class IOImpl {
    #input = "";
    cerr(s) {
        CerrTextarea.value += s + "\n";
    }
    clear() {
        this.#input = CinTextarea.value;
        CoutTextarea.value = "";
        CerrTextarea.value = "";
    }
}
const io = new IOImpl();
const NO_HOLD = U.Option.none();
let runnerHolder = NO_HOLD;
let timerId = undefined;
const DEFAULT_STEP_SIZE = 10000;
let stepSize = DEFAULT_STEP_SIZE;
StepInput.value = `${stepSize}`;
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
        if (src instanceof Token) {
            CodeTextarea.setSelectionRange(src.start, src.end);
            msg += ` ( ${src.row + 1}行目 ${src.col}文字目 "${src.value}" )`;
        }
        else {
            CodeTextarea.setSelectionRange(src[0].start, src.at(-1).end);
            msg += ` ( ${src[0].row + 1}行目 "${Token.lineToString(src)}" )`;
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
function step() {
    if (runnerHolder.isNone) {
        if (timerId) {
            clearInterval(timerId);
            timerId = undefined;
        }
        return;
    }
    try {
        U.assert(timerId !== undefined);
        const runner = runnerHolder.value;
        const result = runner.stepN(stepSize);
        if (result.isOk && result.result) {
            return;
        }
        clearInterval(timerId);
        timerId = undefined;
        runnerHolder = NO_HOLD;
        if (result.isErr) {
            const err = result.error;
            updateStatus("RuntimeError");
            openErrorDetails(err.msg, err.src?.src ?? null);
        }
        else {
            updateStatus("Finished");
        }
        toggleItemDisabled();
    }
    catch (e) {
        clearInterval(timerId);
        timerId = undefined;
        runnerHolder = NO_HOLD;
        updateStatus("UnknownError");
        toggleItemDisabled();
        openErrorDetails(`${e}`, null);
        throw e;
    }
}
StopButton.addEventListener("click", () => {
    if (timerId) {
        clearInterval(timerId);
        timerId = undefined;
    }
    if (runnerHolder.isSome) {
        runnerHolder = NO_HOLD;
    }
    updateStatus("Stopped");
    toggleItemDisabled();
});
RunButton.addEventListener("click", () => {
    if (runnerHolder.isSome) {
        if (timerId) {
            clearInterval(timerId);
            timerId = undefined;
        }
        runnerHolder = NO_HOLD;
    }
    const _stepSize = parseInt(StepInput.value);
    stepSize = isNaN(stepSize) ? DEFAULT_STEP_SIZE : Math.max(1, Math.min(parseInt(StepInput.max), Math.imul(_stepSize, 1)));
    io.clear();
    const src = CodeTextarea.value;
    const reader = new CharReader(src);
    const scanner = new Scanner(reader);
    const parsedResult = parser.parse(scanner);
    if (parsedResult.isErr) {
        const err = parsedResult.error;
        updateStatus("ParseError");
        openErrorDetails(err.msg, err.src);
        return;
    }
    const parsedSrc = parsedResult.result;
    const compiledResult = compiler.compile(parsedSrc);
    runnerHolder = U.Option.some(new Runner(compiledResult, io));
    timerId = setInterval(step, 1);
    updateStatus("Running");
    toggleItemDisabled();
});
const RE_REMOVE_SP = /^ {1,4}/;
const RE_NOT_SP = /[^ ]/;
const REMOVE_SP = s => s.replace(RE_REMOVE_SP, "");
const PAD_SP = s => {
    const p = s.search(RE_NOT_SP);
    return "    ".repeat(1 + (p >> 2)) + s.slice(p);
};
CodeTextarea.addEventListener("keydown", e => {
    if (e.key === "Tab" && !e.altKey && !e.ctrlKey) {
        e.preventDefault();
        let index1;
        let index2;
        if (CodeTextarea.selectionStart === CodeTextarea.selectionEnd) {
            index2 = CodeTextarea.value.indexOf("\n", Math.max(0, CodeTextarea.selectionEnd));
            index1 = Math.max(0, CodeTextarea.value.lastIndexOf("\n", Math.max(0, index2 - 1)) + 1);
        }
        else {
            index1 = Math.max(0, CodeTextarea.value.lastIndexOf("\n", CodeTextarea.selectionStart) + 1);
            index2 = CodeTextarea.value.indexOf("\n", Math.max(0, CodeTextarea.selectionEnd - 1));
        }
        if (index1 !== CodeTextarea.selectionStart || index2 !== CodeTextarea.selectionEnd) {
            CodeTextarea.setSelectionRange(index1, index2);
            return;
        }
        const lines = CodeTextarea.value.slice(index1, index2).split("\n").map(e.shiftKey ? REMOVE_SP : PAD_SP);
        CodeTextarea.setRangeText(lines.join("\n"), index1, index2, "select");
    }
});
export default {};
