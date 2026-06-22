//
// Worker
//
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("worker", LogLevel.ALL);

import CharReader from "./charreader.js";
import Scanner, { Token } from "./scanner.js";
import { Program  } from "./command.js";
import Runner, { Gra, IO, PointerState, State as RunnerState, DEFAULT_POINTER_STATE } from "./runner.js";
import * as compiler from "./compiler.js";
import * as parser from "./parser.js";
import * as U from "./utils.js";
import * as M from "./mes.js";


let program: Program | null = null;

class GraImpl implements Gra {
    readonly #scr: OffscreenCanvas;
    readonly #ctx: OffscreenCanvasRenderingContext2D;
    readonly width: number;
    readonly height: number;

    constructor(width: number, height: number) {
        this.#scr = new OffscreenCanvas(width, height);
        const ctx = this.#scr.getContext("2d");
        U.assert(ctx !== null);
        this.#ctx = ctx;
        this.width = width;
        this.height = height;
    }

    drawLine(x1: number, y1: number, x2: number, y2: number): void {
        const ctx = this.#ctx;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    flush(): void {
        const image = this.#scr.transferToImageBitmap();
        this.#ctx.drawImage(image, 0, 0);
        M.sendTransferImage(self, image);
    }

    setColor(r: number, g: number, b: number): void {
        this.#ctx.strokeStyle = `RGB(${r},${g},${b})`;
    }

    clear(): void {
        this.#ctx.clearRect(0, 0, this.width, this.height);
    }
}

class IoImpl implements IO {

    readonly g: GraImpl;

    #state: Readonly<PointerState> = DEFAULT_POINTER_STATE;

    constructor(g: GraImpl, cin: string) {
        this.g = g;
    }

    cerr(s: string): void {
        const sd: M.WriteCerr = {
            kind: "WriteCerr",
            text: s
        };
        M.send(self, sd);
    }

    reqEventOfPointer(): void {
        M.sendRequestEventOfPointer(self);
    }

    getEventOfPointer():Readonly<PointerState> {
        return this.#state;
    }

    setEventOfPointer(state: PointerState) {
        this.#state = state;
    }
}

let gra: GraImpl | null = null;
let io: IoImpl | null = null;

async function compile(textSrc: string): Promise<undefined> {
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

let runner: Runner | null = null;

function run(): void {
    U.assert(runner !== null);
    do {
        runner.step();
    } while (runner.isRunning);
    if (runner.state === RunnerState.INTERRUPTED) {
        setTimeout(run, 1);
        return;
    }
    if (runner.hasError) {
        const err = runner.error!;
        M.sendRuntimeError(self, err);
    } else {
        M.send(self, { kind: "Finished" });
    }
}

let stepSize: number = 0;
let currentSteps: number = 0;

function steps(): void {
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

async function startRunner(cin: string, width: number, height: number): Promise<undefined> {
    U.assert(program !== null);
    if (gra === null) {
        gra = new GraImpl(width, height);
    } else {
        gra.clear();
    }
    gra.flush();
    io = new IoImpl(gra, cin);
    runner = new Runner(program, io);
    Promise.resolve(undefined)
    .then( () => {
        if (stepSize === 0) {
            run();
        } else {
            currentSteps = 0;
            steps();
        }
    });
}

self.onmessage = e => {
    Promise.resolve(e.data)
    .then( (sd: M.SendData) => {
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
                        } else {
                            io.setEventOfPointer(DEFAULT_POINTER_STATE);
                        }
                    }
                }
                break;
        }
    });
};


export default {};
