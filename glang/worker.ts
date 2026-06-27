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
        ctx.strokeStyle = "rgb(0 0 0)";
        ctx.fillStyle = "rgb(0 0 0)";
        ctx.font = "bold 30px monospace";
        ctx.textBaseline = "top";
    }

    drawArc(left: number, top: number, diameter: number, startAngle: number, endAngle: number): void {
        const ctx = this.#ctx;
        const radius = diameter/2;
        ctx.beginPath();
        ctx.arc(left + radius, top + radius, radius, startAngle, endAngle);
        ctx.stroke();
    }

    drawLine(x1: number, y1: number, x2: number, y2: number): void {
        const ctx = this.#ctx;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    drawRect(left: number, top: number, width: number, height: number): void {
        this.#ctx.strokeRect(left, top, width, height);
    }

    drawText(left: number, top: number, text: string): void {
        this.#ctx.fillText(text, left, top);
    }

    fillArc(left: number, top: number, diameter: number, startAngle: number, endAngle: number): void {
        const ctx = this.#ctx;
        const radius = diameter/2;
        ctx.beginPath();
        ctx.arc(left + radius, top + radius, radius, startAngle, endAngle);
        ctx.fill();
    }

    fillRect(left: number, top: number, width: number, height: number): void {
        this.#ctx.fillRect(left, top, width, height);
    }

    flush(): void {
        const image = this.#scr.transferToImageBitmap();
        this.#ctx.drawImage(image, 0, 0);
        M.sendTransferImage(self, image);
    }

    transfer(): void {
        const image = this.#scr.transferToImageBitmap();
        M.sendTransferImage(self, image);
    }

    setColor(r: number, g: number, b: number): void {
        const color = `rgb(${r & 0xFF} ${g & 0xFF} ${b & 0xFF})`;
        this.#ctx.strokeStyle = color;
        this.#ctx.fillStyle = color;
    }

    setFontSize(size: number): void {
        this.#ctx.font = `bold ${size}px monospace`;        
    }

    cleanUp(): void {
        const ctx = this.#ctx;
        ctx.strokeStyle = "rgb(0 0 0)";
        ctx.fillStyle = "rgb(0 0 0)";
        ctx.clearRect(0, 0, this.width, this.height);
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

async function startRunner(cin: string, width: number, height: number): Promise<undefined> {
    U.assert(program !== null);
    if (gra === null) {
        gra = new GraImpl(width, height);
    } else {
        gra.cleanUp();
    }
    gra.transfer();
    io = new IoImpl(gra, cin);
    runner = new Runner(program, io);
    Promise.resolve(undefined)
    .then( () => void run() );
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
                    const cin = sd.cin;
                    const width = sd.width;
                    const height = sd.height;
                    startRunner(cin, width, height);
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
