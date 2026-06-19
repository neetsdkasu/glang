//
// Worker
//
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("worker", LogLevel.ALL);
import CharReader from "./charreader.js";
import Scanner from "./scanner.js";
import Runner, { State as RunnerState, DEFAULT_POINTER_STATE } from "./runner.js";
import * as compiler from "./compiler.js";
import * as parser from "./parser.js";
import * as U from "./utils.js";
import * as M from "./mes.js";
let program = null;
let canvas = null;
let offCtx = null;
class GraImpl {
    #ctx;
    width;
    height;
    constructor(ctx, width, height) {
        this.#ctx = ctx;
        this.width = width;
        this.height = height;
    }
    drawLine(x1, y1, x2, y2) {
        const ctx = this.#ctx;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    setColor(r, g, b) {
        this.#ctx.strokeStyle = `RGB(${r},${g},${b})`;
    }
    clear() {
        this.#ctx.clearRect(0, 0, this.width, this.height);
    }
}
class IoImpl {
    g;
    #state = DEFAULT_POINTER_STATE;
    constructor(g, cin) {
        this.g = g;
    }
    cerr(s) {
        const sd = {
            kind: "WriteCerr",
            text: s
        };
        M.send(self, sd);
    }
    reqEventOfPointer() {
        M.sendRequestEventOfPointer(self);
    }
    getEventOfPointer() {
        return this.#state;
    }
    setEventOfPointer(state) {
        this.#state = state;
    }
}
let io = null;
async function compile(textSrc) {
    const reader = new CharReader(textSrc);
    const scanner = new Scanner(reader);
    const res = parser.parse(scanner);
    if (res.isErr) {
        const err = res.error;
        M.sendParseError(self, err);
        return;
    }
    const parsedSource = res.result;
    program = compiler.compile(parsedSource);
    if (canvas === null) {
        M.sendRequestCanvas(self);
    }
    else {
        M.send(self, { kind: "Ready" });
    }
}
let runner = null;
function run() {
    U.assert(runner !== null);
    do {
        runner.step();
    } while (runner.isRunning);
    if (runner.state === RunnerState.INTERRUPTED) {
        setTimeout(run, 1);
        return;
    }
    if (runner.hasError) {
        const err = runner.error;
        M.sendRuntimeError(self, err);
    }
    else {
        M.send(self, { kind: "Finished" });
    }
}
let stepSize = 0;
let currentSteps = 0;
function steps() {
    U.assert(runner !== null);
    if (stepSize < 0) {
        M.send(self, { kind: "Stop" });
        return;
    }
    if (currentSteps < stepSize) {
        do {
            runner.step();
            currentSteps++;
        } while (currentSteps < stepSize && runner.isRunning);
    }
    switch (runner.state) {
        case RunnerState.ENDED:
            M.send(self, { kind: "Finished" });
            return;
        case RunnerState.ERROR:
            U.assert(runner.error !== null);
            const err = runner.error;
            M.sendRuntimeError(self, err);
            return;
        case RunnerState.INTERRUPTED:
        case RunnerState.RUNNING:
            if (currentSteps === stepSize) {
                currentSteps = 0;
            }
            setTimeout(steps, 1);
            return;
    }
}
async function startRunner(cin) {
    U.assert(program !== null);
    U.assert(canvas !== null);
    if (offCtx === null) {
        offCtx = canvas.getContext("2d");
        if (offCtx === null) {
            M.send(self, { kind: "Stop" });
            return;
        }
    }
    const g = new GraImpl(offCtx, canvas.width, canvas.height);
    g.clear();
    io = new IoImpl(g, cin);
    runner = new Runner(program, io);
    if (stepSize === 0) {
        run();
    }
    else {
        currentSteps = 0;
        steps();
    }
}
self.onmessage = e => {
    Promise.resolve(e.data)
        .then((sd) => {
        switch (sd.kind) {
            case "TextSrc":
                {
                    const src = sd.textSrc;
                    M.sendMessage(self, "compiling");
                    compile(src);
                }
                break;
            case "GoRun":
                {
                    M.sendMessage(self, "running");
                    stepSize = sd.stepSize;
                    if (stepSize < 0) {
                        U.unreachable(`stepSize: ${stepSize}`);
                    }
                    else {
                        const cin = sd.cin;
                        startRunner(cin);
                    }
                }
                break;
            case "Stop":
                {
                    stepSize = -1;
                }
                break;
            case "TransferCanvas":
                {
                    canvas = sd.canvas;
                    if (canvas === null) {
                        U.unreachable("canvas === null");
                    }
                    else {
                        M.send(self, { kind: "Ready" });
                    }
                }
                break;
            case "EventOfPointer":
                {
                    if (io !== null) {
                        const pstate = sd.state;
                        if (pstate !== null) {
                            io.setEventOfPointer(pstate);
                        }
                        else {
                            io.setEventOfPointer(DEFAULT_POINTER_STATE);
                        }
                    }
                }
                break;
        }
    });
};
export default {};
