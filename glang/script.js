//
// script
//
import Logger, { LogLevel } from "logger";
const log = new Logger("main", LogLevel.ALL);
import CharReader from "charreader";
import Scanner from "scanner";
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
            updateStatus("RuntimeError");
            io.cerr(`${result.error}`);
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
        io.cerr(`${e}`);
        toggleItemDisabled();
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
        updateStatus("ParseError");
        io.cerr(parsedResult.error);
        return;
    }
    const parsedSrc = parsedResult.result;
    const compiledResult = compiler.compile(parsedSrc);
    runnerHolder = U.Option.some(new Runner(compiledResult, io));
    timerId = setInterval(step, 1);
    updateStatus("Running");
    toggleItemDisabled();
});
export default {};
