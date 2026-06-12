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
const CodeTextarea = document.getElementById("code") as HTMLTextAreaElement;

class IOImpl implements IO {
    stderr(s: string): void {
        log.error(s);
    }
}

const NO_HOLD: U.Option<Runner> = U.Option.none();

let runnerHolder: U.Option<Runner> = NO_HOLD;

let timerId: number | undefined = undefined;

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
        const result = runner.step();
        if (result.isOk && result.result) {
            return;
        }
        clearInterval(timerId);
        timerId = undefined;
        runnerHolder = NO_HOLD;
        if (result.isErr) {
            log.error(result.error);
            alert(result.error);
        }
    } catch (e) {
        clearInterval(timerId);
        timerId = undefined;
        runnerHolder = NO_HOLD;
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
    log.info("stopped");
});

/**
 * 
 */
RunButton.addEventListener("click", () => {
    if (runnerHolder.isSome) {
        if (timerId) {
            clearInterval(timerId)
            timerId = undefined;
        }
        runnerHolder = NO_HOLD;
    }

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

    runnerHolder = U.Option.some(new Runner(compiledResult, new IOImpl()));

    timerId = setInterval(step, 1);
});


export default {};
