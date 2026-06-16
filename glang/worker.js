//
// Worker
//
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("worker", LogLevel.ALL);
import CharReader from "./charreader.js";
import Scanner from "./scanner.js";
import Runner from "./runner.js";
import * as compiler from "./compiler.js";
import * as parser from "./parser.js";
import * as U from "./utils.js";
import * as M from "./mes.js";
class IoImpl {
    cerr(s) {
        const sd = {
            kind: "WriteCerr",
            text: s
        };
        M.send(self, sd);
    }
}
let program = null;
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
async function goRun() {
    U.assert(program !== null);
    io = new IoImpl();
    runner = new Runner(program, io);
    const res = runner.run();
    if (res.isErr) {
        const err = res.error;
        M.sendRuntimeError(self, err);
    }
    else {
        M.send(self, { kind: "Finished" });
    }
}
let stepSize = 0;
function steps() {
    U.assert(runner !== null);
    if (stepSize < 0) {
        M.send(self, { kind: "Stop" });
        return;
    }
    const res = runner.stepN(stepSize);
    if (res.isErr) {
        const err = res.error;
        M.sendRuntimeError(self, err);
    }
    else if (res.result) {
        self.setTimeout(steps, 1);
    }
    else {
        M.send(self, { kind: "Finished" });
    }
}
async function goSteps() {
    U.assert(program !== null);
    io = new IoImpl();
    runner = new Runner(program, io);
    steps();
}
self.onmessage = e => {
    const sd = e.data;
    switch (sd.kind) {
        case "TextSrc":
            const src = sd.textSrc;
            M.sendMessage(self, "compiling");
            compile(src);
            break;
        case "GoRun":
            M.sendMessage(self, "running");
            stepSize = sd.stepSize;
            if (stepSize === 0) {
                goRun();
            }
            else if (stepSize > 0) {
                goSteps();
            }
            else {
                M.send(self, { kind: "Stop" });
            }
            break;
        case "Stop":
            stepSize = -1;
            break;
    }
};
export default {};
