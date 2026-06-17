//
// Worker
//
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("worker", LogLevel.ALL);

import CharReader from "./charreader.js";
import Scanner, { Token } from "./scanner.js";
import { Program  } from "./command.js";
import Runner, { Gra, IO } from "./runner.js";
import * as compiler from "./compiler.js";
import * as parser from "./parser.js";
import * as U from "./utils.js";
import * as M from "./mes.js";


let program: Program | null = null;

let canvas: OffscreenCanvas | null = null;
let offCtx: OffscreenCanvasRenderingContext2D | null = null;

class GraImpl implements Gra {
    readonly #ctx: OffscreenCanvasRenderingContext2D;
    readonly width: number;
    readonly height: number;

    constructor(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number) {
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

    clear(): void {
        this.#ctx.clearRect(0, 0, this.width, this.height);
    }
}

class IoImpl implements IO {

    readonly g: GraImpl;

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
}

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
    if (canvas === null) {
        M.sendRequestCanvas(self);
    } else {
        M.send(self, { kind: "Ready" });
    }
}

let runner: Runner | null = null;

function run(): void {
    U.assert(runner !== null);
    const res = runner.run();
    if (res.isErr) {
        const err = res.error;
        M.sendRuntimeError(self, err);
    } else {
        M.send(self, { kind: "Finished" });
    }
}

let stepSize: number = 0;

function steps(): void {
    U.assert(runner !== null);
    if (stepSize < 0) {
        M.send(self, { kind: "Stop" });
        return;
    }
    const res = runner.stepN(stepSize);
    if (res.isErr) {
        const err = res.error;
        M.sendRuntimeError(self, err);
    } else if (res.result) {
        self.setTimeout(steps, 1);
    } else {
        M.send(self, { kind: "Finished" });
    }
}


async function startRunner(cin: string): Promise<undefined> {
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
    } else {
        steps();
    }
}

self.onmessage = e => {
    Promise.resolve(e.data)
    .then( (sd: M.SendData) => {
        switch (sd.kind) {
            case "TextSrc":
                const src = sd.textSrc;
                M.sendMessage(self, "compiling");
                compile(src);
                break;
            case "GoRun":
                M.sendMessage(self, "running");
                stepSize = sd.stepSize;
                const cin = sd.cin;
                if (stepSize < 0) {
                    U.unreachable(`stepSize: ${stepSize}`);
                } else {
                    startRunner(cin);
                }
                break;
            case "Stop":
                stepSize = -1;
                break;
            case "TransferCanvas":
                canvas = sd.canvas;
                if (canvas === null) {
                    U.unreachable("canvas === null");
                } else {
                    M.send(self, { kind: "Ready" });
                }
                break;
        }
    });
};


export default {};
