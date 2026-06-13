//
// script
//

import Logger, { LogLevel } from "logger";
const log = new Logger("main", LogLevel.ALL);

import CharReader from "charreader";
import Scanner from "scanner";
import * as parser from "parser";
import * as compiler from "compiler";
import Runner, { IO } from "runner";
import * as U from "utils";

/**
 * UI
 */
const Canvas = document.getElementById("canvas") as HTMLCanvasElement;
const RunButton = document.getElementById("run") as HTMLButtonElement;
const StopButton = document.getElementById("stop") as HTMLButtonElement;
const StatusSpan = document.getElementById("status") as HTMLSpanElement;
const CodeTextarea = document.getElementById("code") as HTMLTextAreaElement;
const CerrTextarea = document.getElementById("cerr") as HTMLTextAreaElement;
const CinTextarea = document.getElementById("cin") as HTMLTextAreaElement;
const CoutTextarea = document.getElementById("cout") as HTMLTextAreaElement;
const StepInput = document.getElementById("step") as HTMLInputElement;

class IOImpl implements IO {
    #input: string = "";

    cerr(s: string): void {
        CerrTextarea.value += s + "\n";
    }
    
    clear(): void {
        this.#input = CinTextarea.value;
        CoutTextarea.value = "";
        CerrTextarea.value = "";
    }
}
const io = new IOImpl();

const NO_HOLD: U.Option<Runner> = U.Option.none();

let runnerHolder: U.Option<Runner> = NO_HOLD;

let timerId: number | undefined = undefined;

const DEFAULT_STEP_SIZE = 10000;
let stepSize: number = DEFAULT_STEP_SIZE;
StepInput.value = `${stepSize}`;

function updateStatus(s: string): void {
    StatusSpan.textContent = s;
}

function toggleItemDisabled(): void {
    RunButton.disabled = !RunButton.disabled;
    StopButton.disabled = !StopButton.disabled;
    StepInput.disabled = !StepInput.disabled;
    CinTextarea.disabled = !CinTextarea.disabled;
    CodeTextarea.disabled = !CodeTextarea.disabled;
}

function step(): void {
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
        } else {
            updateStatus("Finished");
        }
        toggleItemDisabled();
    } catch (e) {
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
        clearInterval(timerId)
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
            clearInterval(timerId)
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
