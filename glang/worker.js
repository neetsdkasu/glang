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
class GraImpl {
    #scr;
    #ctx;
    width;
    height;
    constructor(width, height) {
        this.#scr = new OffscreenCanvas(width, height);
        const ctx = this.#scr.getContext("2d");
        U.assert(ctx !== null);
        this.#ctx = ctx;
        this.width = width;
        this.height = height;
        ctx.strokeStyle = "rgb(0 0 0)";
        ctx.fillStyle = "rgb(0 0 0)";
        ctx.font = "bold 30px monospace";
        ctx.textBaseline = "top";
    }
    drawArc(left, top, diameter, startAngle, endAngle) {
        const ctx = this.#ctx;
        const radius = diameter / 2;
        ctx.beginPath();
        ctx.arc(left + radius, top + radius, radius, startAngle, endAngle);
        ctx.stroke();
    }
    drawLine(x1, y1, x2, y2) {
        const ctx = this.#ctx;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    drawRect(left, top, width, height) {
        this.#ctx.strokeRect(left, top, width, height);
    }
    drawText(left, top, text) {
        this.#ctx.fillText(text, left, top);
    }
    fillArc(left, top, diameter, startAngle, endAngle) {
        const ctx = this.#ctx;
        const radius = diameter / 2;
        ctx.beginPath();
        ctx.arc(left + radius, top + radius, radius, startAngle, endAngle);
        ctx.fill();
    }
    fillRect(left, top, width, height) {
        this.#ctx.fillRect(left, top, width, height);
    }
    flush() {
        const image = this.#scr.transferToImageBitmap();
        this.#ctx.drawImage(image, 0, 0);
        M.sendTransferImage(self, image);
    }
    transfer() {
        const image = this.#scr.transferToImageBitmap();
        M.sendTransferImage(self, image);
    }
    setColor(r, g, b) {
        const color = `rgb(${r & 0xFF} ${g & 0xFF} ${b & 0xFF})`;
        this.#ctx.strokeStyle = color;
        this.#ctx.fillStyle = color;
    }
    setFontSize(size) {
        this.#ctx.font = `bold ${size}px monospace`;
    }
    cleanUp() {
        const ctx = this.#ctx;
        ctx.strokeStyle = "rgb(0 0 0)";
        ctx.fillStyle = "rgb(0 0 0)";
        ctx.clearRect(0, 0, this.width, this.height);
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
let gra = null;
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
    M.send(self, { kind: "Ready" });
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
async function startRunner(cin, width, height) {
    U.assert(program !== null);
    if (gra === null) {
        gra = new GraImpl(width, height);
    }
    else {
        gra.cleanUp();
    }
    gra.transfer();
    io = new IoImpl(gra, cin);
    runner = new Runner(program, io);
    Promise.resolve(undefined)
        .then(() => {
        if (stepSize === 0) {
            run();
        }
        else {
            currentSteps = 0;
            steps();
        }
    });
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
                    U.assert(stepSize >= 0);
                    const cin = sd.cin;
                    const width = sd.width;
                    const height = sd.height;
                    startRunner(cin, width, height);
                }
                break;
            case "Stop":
                {
                    stepSize = -1;
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
