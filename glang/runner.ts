//
// Runner
// 
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("runner", LogLevel.ALL);

import { Cmd, Program, StdFunc, Source } from "./command.js";
import { Result } from "./utils.js";
import Xorshift32 from "./xorshift.js";
import * as U from "./utils.js";

export class RuntimeError 
{
    readonly msg: string;
    readonly src: Source | undefined;

    constructor(msg: string, src: Source | undefined) {
        this.msg = msg;
        this.src = src;
    }

    toString(): string {
        return `RuntimeError{ msg: ${this.msg}, src: ${this.src} }`;
    }
}
export type IsRunning = boolean;
export type RunnerResult = Result<IsRunning,RuntimeError>;

const RUNNING: RunnerResult = Result.ok(true);
const ENDED: RunnerResult = Result.ok(false);

export interface Gra {
    readonly width: number;
    readonly height: number;
    drawLine(x1: number, y1: number, x2: number, y2: number): void;
    setColor(r: number, g: number, b: number): void;
}

export interface IO {
    readonly g: Gra;
    cerr(s: string): void;
}

type ValueType = boolean | number | string;
type VarType = boolean | number | string | boolean[] | boolean[][] | boolean[][][] | number[] | number[][] | number[][][] | string[] | string[][] | string[][][];

function isValidIndex<T>(arr: T[], index: number): boolean {
    return 0 <= index && index < arr.length;
}

function isValidIndex2<T>(arr: T[][], index1: number, index2: number): boolean {
    return 0 <= index1 && index1 < arr.length
        && 0 <= index2 && index2 < arr[index1].length;
}

function isValidIndex3<T>(arr: T[][][], index1: number, index2: number, index3: number): boolean {
    return 0 <= index1 && index1 < arr.length
        && 0 <= index2 && index2 < arr[index1].length
        && 0 <= index3 && index3 < arr[index1][index2].length;
}

export class Runner {
    readonly #program: Readonly<number[]>;
    readonly #litStrPool: Readonly<string[]>;
    readonly #io: IO;
    readonly #sourceMap: Readonly<Source[]>;

    #pos: number = 0;
    #isRunning: boolean = true;
    #error: U.Option<RunnerResult> = U.Option.none();

    #block: VarType[][];
    #blockStack: VarType[][][];

    #valueStack: ValueType[] = [];
    #addressStack: number[] = [];

    #rng: Xorshift32 = new Xorshift32(0xC0FFEE);

    constructor(program: Program, io: IO) {
        this.#program = program.program;
        this.#litStrPool = program.litStrPool;
        this.#sourceMap = program.sourceMap;
        this.#block = new Array(program.totalBlockCount).fill([]).map( () => [] );
        this.#blockStack = new Array(program.totalBlockCount).fill([]).map( () => [] );
        this.#io = io;
    }

    #findSource(addr: number): Source | undefined {
        const index = U.binarySearch(this.#sourceMap, (s => s.addr.min >= addr ));
        if (index !== undefined && this.#sourceMap[index].addr.include(addr)) {
            return this.#sourceMap[index];
        }
        return undefined;
    }    

    #runtimeError(addr: number, msg: string): RunnerResult {
        const src = this.#findSource(addr);
        const err: RunnerResult = Result.err(new RuntimeError(msg, src));
        this.#error = U.Option.some(err);
        this.#isRunning = false;
        return err;
    }

    run(): RunnerResult {
        while (this.#isRunning) {
            this.step();
        }
        return this.#error.getOr(ENDED);
    }

    stepN(n: number): RunnerResult {
        for (let i = 1; i < n; i++) {
            this.step();
        }
        return this.step();
    }

    step(): RunnerResult {
        if (!this.#isRunning) {
            return this.#error.getOr(ENDED);
        }
        const cmd: Cmd = this.#program[this.#pos++];
        // log.dump("pos", this.#pos);
        // log.dump("cmd", Cmd[cmd]);
        switch (cmd) {
            case Cmd.NOP:
                break;
            case Cmd.END: 
                {
                    this.#isRunning = false;
                }
                return ENDED;
            case Cmd.POP:
                {
                    this.#valueStack.pop();
                }
                break;
            case Cmd.DUP:
                {
                    this.#valueStack.push(this.#valueStack.at(-1)!);
                }
                break;
            case Cmd.DUPN:
                {
                    const N: number = this.#program[this.#pos++];
                    for (let i = 0; i < N; i++) {
                        this.#valueStack.push(this.#valueStack.at(-N)!);
                    }
                }
                break;
            case Cmd.SWAP:
                {
                    const oldTop = this.#valueStack.pop()!;
                    const newTop = this.#valueStack.pop()!;
                    this.#valueStack.push(oldTop);
                    this.#valueStack.push(newTop);
                }
                break;
            case Cmd.BPUSH_TRUE:
                {
                    this.#valueStack.push(true);
                }
                break;
            case Cmd.BPUSH_FALSE:
                {
                    this.#valueStack.push(false);
                }
                break;
            case Cmd.BNOT:
                {
                    const value = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(!value);
                }
                break;
            case Cmd.BAND:
                {
                    const right = this.#valueStack.pop() as boolean;
                    const left = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(left && right);
                }
                break;
            case Cmd.BOR:
                {
                    const right = this.#valueStack.pop() as boolean;
                    const left = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(left || right);
                }
                break;
            case Cmd.BEQ:
                {
                    const right = this.#valueStack.pop() as boolean;
                    const left = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(left === right);
                }
                break;
            case Cmd.BNE:
                {
                    const right = this.#valueStack.pop() as boolean;
                    const left = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(left !== right);
                }
                break;
            case Cmd.GET_BVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId] as boolean;
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.SET_BVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    this.#block[blockId][blockVarId] = value;
                }
                break;
            case Cmd.GET_BARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[];
                    if (!isValidIndex(arr, index1)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                    this.#valueStack.push(arr[index1]);
                }
                break;
            case Cmd.SET_BARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[];
                    if (!isValidIndex(arr, index1)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                    arr[index1] = value;
                }
                break;
            case Cmd.GET_BARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][];
                    if (!isValidIndex2(arr, index1, index2)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                    this.#valueStack.push(arr[index1][index2]);
                }
                break;
            case Cmd.SET_BARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][];
                    if (!isValidIndex2(arr, index1, index2)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                    arr[index1][index2] = value;
                }
                break;
            case Cmd.GET_BARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][][];
                    if (!isValidIndex3(arr, index1, index2, index3)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                    this.#valueStack.push(arr[index1][index2][index3]);
                }
                break;
            case Cmd.SET_BARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][][];
                    if (!isValidIndex3(arr, index1, index2, index3)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                    arr[index1][index2][index3] = value;
                }
                break;
            case Cmd.FPUSH:
                {
                    const floatValue = this.#program[this.#pos++];
                    this.#valueStack.push(floatValue);
                }
                break;
            case Cmd.FADD:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left + right);
                }
                break;
            case Cmd.FSUB:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left - right);
                }
                break;
            case Cmd.FMUL:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left * right);
                }
                break;
            case Cmd.FDIV:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    const value = left / right;
                    if (U.isInfinityOrNaN(value)) {
                        return this.#runtimeError(this.#pos-1, `wrong divide: ${left} / ${right}`);
                    }
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.FNEGA:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(-value);
                }
                break;
            case Cmd.FEQ:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left === right);
                }
                break;
            case Cmd.FNE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left !== right);
                }
                break;
            case Cmd.FLT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left < right);
                }
                break;
            case Cmd.FLE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left <= right);
                }
                break;
            case Cmd.FGT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left > right);
                }
                break;
            case Cmd.FGE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left >= right);
                }
                break;
            case Cmd.GET_FVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId] as number;
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.SET_FVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    this.#block[blockId][blockVarId] = value;
                }
                break;
            case Cmd.GET_FARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (!isValidIndex(arr, index1)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                    this.#valueStack.push(arr[index1]);
                }
                break;
            case Cmd.SET_FARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (!isValidIndex(arr, index1)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                    arr[index1] = value;
                }
                break;
            case Cmd.GET_FARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    if (!isValidIndex2(arr, index1, index2)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                    this.#valueStack.push(arr[index1][index2]);
                }
                break;
            case Cmd.SET_FARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    if (!isValidIndex2(arr, index1, index2)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                    arr[index1][index2] = value;
                }
                break;
            case Cmd.GET_FARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    if (!isValidIndex3(arr, index1, index2, index3)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                    this.#valueStack.push(arr[index1][index2][index3]);
                }
                break;
            case Cmd.SET_FARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    if (!isValidIndex3(arr, index1, index2, index3)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                    arr[index1][index2][index3] = value;
                }
                break;
            case Cmd.IPUSH:
                {
                    const intValue = this.#program[this.#pos++];
                    this.#valueStack.push(intValue);
                    // log.dump("intValue", intValue);
                }
                break;
            case Cmd.IADD:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push((left + right) & 0xFFFFFFFF);
                }
                break;
            case Cmd.ISUB:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push((left - right) & 0xFFFFFFFF);
                }
                break;
            case Cmd.IMUL:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.imul(left, right));
                }
                break;
            case Cmd.IDIV:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    const value = left / right;
                    if (U.isInfinityOrNaN(value)) {
                        return this.#runtimeError(this.#pos-1, `wrong divide: ${left} / ${right}`);
                    }
                    this.#valueStack.push(Math.trunc(value));
                }
                break;
            case Cmd.IREM:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    const value = left % right;
                    if (U.isInfinityOrNaN(value)) {
                        return this.#runtimeError(this.#pos-1, `wrong divide: ${left} % ${right}`);
                    }
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.INEGA:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(-value);
                }
                break;
            case Cmd.IASHIFTL:
                {
                    const right = this.#valueStack.pop() as number & 31;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(0xFFFFFFFF & ((0x80000000 & left) | (left << right)));
                }
                break;
            case Cmd.IASHIFTR:
                {
                    const right = this.#valueStack.pop() as number & 31;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(0xFFFFFFFF & (left >> right));
                }
                break;
            case Cmd.ILSHIFTL:
                {
                    const right = this.#valueStack.pop() as number & 31;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(0xFFFFFFFF & (left << right));
                }
                break;
            case Cmd.ILSHIFTR:
                {
                    const right = this.#valueStack.pop() as number & 31;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(0xFFFFFFFF & (left >>> right));
                }
                break;
            case Cmd.INOT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(0xFFFFFFFF & (~value));
                }
                break;
            case Cmd.IAND:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left & right);
                }
                break;
            case Cmd.IOR:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left | right);
                }
                break;
            case Cmd.IXOR:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left ^ right);
                }
                break;
            case Cmd.IEQ:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left === right);
                }
                break;
            case Cmd.INE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left !== right);
                }
                break;
            case Cmd.ILT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left < right);
                }
                break;
            case Cmd.ILE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left <= right);
                }
                break;
            case Cmd.IGT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left > right);
                }
                break;
            case Cmd.IGE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left >= right);
                }
                break;
            case Cmd.GET_IVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId] as number;
                    this.#valueStack.push(value);
                }
                break;                
            case Cmd.SET_IVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    this.#block[blockId][blockVarId] = value;
                }
                break;
            case Cmd.GET_IARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (!isValidIndex(arr, index1)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                    this.#valueStack.push(arr[index1]);
                }
                break;
            case Cmd.SET_IARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (!isValidIndex(arr, index1)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                    arr[index1] = value;
                }
                break;
            case Cmd.GET_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    if (!isValidIndex2(arr, index1, index2)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                    this.#valueStack.push(arr[index1][index2]);
                }
                break;
            case Cmd.SET_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    if (!isValidIndex2(arr, index1, index2)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                    arr[index1][index2] = value;
                }
                break;
            case Cmd.GET_IARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    if (!isValidIndex3(arr, index1, index2, index3)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                    this.#valueStack.push(arr[index1][index2][index3]);
                }
                break;
            case Cmd.SET_IARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    if (!isValidIndex3(arr, index1, index2, index3)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                    arr[index1][index2][index3] = value;
                }
                break;
            case Cmd.SPUSH:
                {
                    const litStrId = this.#program[this.#pos++];
                    const value = this.#litStrPool[litStrId];
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.SCONCAT:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left + right);
                }
                break;
            case Cmd.SEQ:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left === right);
                }
                break;
            case Cmd.SNE:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left !== right);
                }
                break;
            case Cmd.SLT:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left < right);
                }
                break;
            case Cmd.SLE:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left <= right);
                }
                break;
            case Cmd.SGT:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left > right);
                }
                break;
            case Cmd.SGE:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left >= right);
                }
                break;
            case Cmd.GET_SVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId] as string;
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.SET_SVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as string;
                    this.#block[blockId][blockVarId] = value;
                }
                break;
            case Cmd.GET_SARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[];
                    if (!isValidIndex(arr, index1)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                    this.#valueStack.push(arr[index1]);
                }
                break;
            case Cmd.SET_SARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as string;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[];
                    if (!isValidIndex(arr, index1)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                    arr[index1] = value;
                }
                break;
            case Cmd.GET_SARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][];
                    if (!isValidIndex2(arr, index1, index2)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                    this.#valueStack.push(arr[index1][index2]);
                }
                break;
            case Cmd.SET_SARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as string;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][];
                    if (!isValidIndex2(arr, index1, index2)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                    arr[index1][index2] = value;
                }
                break;
            case Cmd.GET_SARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][][];
                    if (!isValidIndex3(arr, index1, index2, index3)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                    this.#valueStack.push(arr[index1][index2][index3]);
                }
                break;
            case Cmd.SET_SARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as string;
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][][];
                    if (!isValidIndex3(arr, index1, index2, index3)) {
                        return this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                    arr[index1][index2][index3] = value;
                }
                break;
            case Cmd.APUSH_BARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_BARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_BARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_FARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_FARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_FARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_IARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_IARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_SARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_SARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_SARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.INIT_BARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<boolean>(size1).fill(false);
                }
                break;
            case Cmd.INIT_BARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<boolean[]>(size1).fill([]).map( () => new Array<boolean>(size2).fill(false) );
                }
                break;
            case Cmd.INIT_BARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    const size3 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<boolean[][]>(size1).fill([])
                        .map( () => new Array<boolean[]>(size2).fill([]).map( () => new Array<boolean>(size3).fill(false) ) );
                }
                break;
            case Cmd.INIT_FARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<number>(size1).fill(0.0);
                }
                break;
            case Cmd.INIT_FARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<number[]>(size1).fill([]).map( () => new Array<number>(size2).fill(0) );
                }
                break;
            case Cmd.INIT_FARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    const size3 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<number[][]>(size1).fill([])
                        .map( () => new Array<number[]>(size2).fill([]).map( () => new Array<number>(size3).fill(0.0) ) );
                }
                break;
            case Cmd.INIT_IARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<number>(size1).fill(0);
                }
                break;
            case Cmd.INIT_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<number[]>(size1).fill([]).map( () => new Array<number>(size2).fill(0) );
                }
                break;
            case Cmd.INIT_IARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    const size3 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<number[][]>(size1).fill([])
                        .map( () => new Array<number[]>(size2).fill([]).map( () => new Array<number>(size3).fill(0) ) );
                }
                break;
            case Cmd.INIT_SARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<string>(size1).fill("");
                }
                break;
            case Cmd.INIT_SARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<string[]>(size1).fill([]).map( () => new Array<string>(size2).fill("") );
                }
                break;
            case Cmd.INIT_SARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    const size3 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<string[][]>(size1).fill([])
                        .map( () => new Array<string[]>(size2).fill([]).map( () => new Array<string>(size3).fill("") ) );
                }
                break;
            case Cmd.JUMP:
                {
                    const addr = this.#program[this.#pos++];
                    this.#pos = addr;
                }
                break;
            case Cmd.JUMP_IF_TRUE:
                {
                    const addr = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    if (value) {
                        this.#pos = addr;
                    }
                }
                break;
            case Cmd.JUMP_IF_FALSE:
                {
                    const addr = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    if (!value) {
                        this.#pos = addr;
                    }
                }
                break;
            case Cmd.CALL_STDFUNC:
                {
                    const stdfuncId = this.#program[this.#pos++] as StdFunc;
                    return this.#callStdfunc(stdfuncId);
                }
            case Cmd.CALL_USERFUNC:
                {
                    const userfuncAddress = this.#program[this.#pos++];
                    const returnAddress = this.#program[this.#pos++];
                    this.#pos = userfuncAddress;
                    this.#addressStack.push(returnAddress);
                }
                break;
            case Cmd.RET:
                {
                    const addr = this.#addressStack.pop()!;
                    this.#pos = addr;
                }
                break;
            case Cmd.PUSH_BLOCK:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarCount = this.#program[this.#pos++];
                    this.#blockStack[blockId].push(this.#block[blockId]);
                    this.#block[blockId] = new Array(blockVarCount).fill(undefined);
                }
                break;
            case Cmd.POP_BLOCK:
                {
                    const blockId = this.#program[this.#pos++];
                    this.#block[blockId] = this.#blockStack[blockId].pop()!;
                }
                break;
            case Cmd.PRINT:
                {
                    const N = this.#program[this.#pos++];
                    const arr = this.#valueStack.splice(-N).map( e => `${e}` );
                    this.#io.cerr(arr.join(" "));
                }
                break;
            case Cmd.DRAW_LINE:
                {
                    const y2 = this.#valueStack.pop() as number;
                    const x2 = this.#valueStack.pop() as number;
                    const y1 = this.#valueStack.pop() as number;
                    const x1 = this.#valueStack.pop() as number;
                    this.#io.g.drawLine(x1, y1, x2, y2);
                }
                break;
            case Cmd.SET_COLOR:
                {
                    const b = this.#valueStack.pop() as number;
                    const g = this.#valueStack.pop() as number;
                    const r = this.#valueStack.pop() as number;
                    this.#io.g.setColor(r & 0xFF, g & 0xFF, b & 0xFF);
                }
                break;
            case Cmd.RANDOMIZE_TIME:
                {
                    const seed = Date.now();
                    this.#rng.setSeed(seed);
                }
                break;
            case Cmd.RANDOMIZE_SEED:
                {
                    const seed = this.#valueStack.pop() as number;
                    this.#rng.setSeed(seed);
                }
                break;
            default:
                throw new U.Unimplemented(Cmd[cmd]);
        }
        return RUNNING;
    }

    #callStdfunc(stdfuncId: StdFunc): RunnerResult {
        // log.dump("stdfuncId", StdFunc[stdfuncId]);
        switch (stdfuncId) {
            case StdFunc.CBOOL_FROM_BOOLEAN:
                // 処理不要.
                break;
            case StdFunc.CBOOL_FROM_FLOAT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(value != 0.0);
                }
                break;
            case StdFunc.CBOOL_FROM_INTEGER:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(value !== 0);
                }
                break;
            case StdFunc.CBOOL_FROM_STRING:
                {
                    const value = this.#valueStack.pop() as string;
                    this.#valueStack.push(value.length > 0);
                }
                break;
            case StdFunc.CFLOAT_FROM_BOOLEAN:
                {
                    const value = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(value ? 1.0 : 0.0);
                }
                break;
            case StdFunc.CFLOAT_FROM_FLOAT:
                // 処理不要.
                break;
            case StdFunc.CFLOAT_FROM_INTEGER:
                // 処理不要.
                break;
            case StdFunc.CFLOAT_FROM_STRING:
                {
                    const strValue = this.#valueStack.pop() as string;
                    const floatValue = parseFloat(strValue);
                    if (U.isInfinityOrNaN(floatValue)) {
                        this.#valueStack.push(0.0);
                    } else {
                        this.#valueStack.push(floatValue);
                    }
                }
                break;
            case StdFunc.CINT_FROM_BOOLEAN:
                {
                    const value = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(value ? 1 : 0);
                }
                break;
            case StdFunc.CINT_FROM_FLOAT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.imul(value, 1));
                }
                break;
            case StdFunc.CINT_FROM_INTEGER:
                // 処理不要.
                break;
            case StdFunc.CINT_FROM_STRING:
                {
                    const strValue = this.#valueStack.pop() as string;
                    const intValue = parseInt(strValue);
                    if (U.isInfinityOrNaN(intValue)) {
                        this.#valueStack.push(0);
                    } else {
                        this.#valueStack.push(intValue);
                    }
                }
                break;
            case StdFunc.CSTR_FROM_BOOLEAN:
                {
                    const value = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(`${value}`);
                }
                break;
            case StdFunc.CSTR_FROM_FLOAT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(`${value}`);
                }
                break;
            case StdFunc.CSTR_FROM_INTEGER:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(`${value}`);
                }
                break;
            case StdFunc.CSTR_FROM_STRING:
                // 処理不要.
                break;
            case StdFunc.SIN:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.sin(value));
                }
                break;
            case StdFunc.COS:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.cos(value));
                }
                break;
            case StdFunc.TAN:
                {
                    const value = this.#valueStack.pop() as number;
                    const tanValue = Math.tan(value);
                    if (U.isInfinityOrNaN(tanValue)) {
                        return this.#runtimeError(this.#pos-2, `wrong tan argument: tan(${value})`);
                    }
                    this.#valueStack.push(tanValue);
                }
                break;

            case StdFunc.ABS_FLOAT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.abs(value));
                }
                break;
            case StdFunc.ABS_INTGER:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.abs(value));
                }
                break;
            case StdFunc.SIGN_FLOAT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.sign(value));
                }
                break;
            case StdFunc.SIGN_INTEGER:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.sign(value));
                }
                break;
            case StdFunc.MIN_FLOAT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.min(left, right));
                }
                break;
            case StdFunc.MIN_INTEGER:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.min(left, right));
                }
                break;
            case StdFunc.MAX_FLOAT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.max(left, right));
                }
                break;
            case StdFunc.MAX_INTEGER:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.max(left, right));
                }
                break;
            case StdFunc.POW:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.pow(left, right));
                }
                break;
            case StdFunc.SQRT:
                {
                    const value = this.#valueStack.pop() as number;
                    const sqrtValue = Math.sqrt(value);
                    if (U.isInfinityOrNaN(sqrtValue)) {
                        return this.#runtimeError(this.#pos-2, `wrong sqrt argument: sqrt(${value})`);
                    }
                    this.#valueStack.push(sqrtValue);
                }
                break;
            case StdFunc.FLOOR:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.floor(value));
                }
                break;
            case StdFunc.CEIL:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.ceil(value));
                }
                break;
            case StdFunc.SIZE_BARR1D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[];
                    if (dim === 1) {
                        this.#valueStack.push(arr.length);
                    } else {
                        return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_BARR2D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            break;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            break;
                        default:
                            return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_BARR3D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            break;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            break;
                        case 3:
                            this.#valueStack.push(arr[0][0].length);
                            break;
                        default:
                            return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_FARR1D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (dim === 1) {
                        this.#valueStack.push(arr.length);
                    } else {
                        return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_FARR2D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            break;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            break;
                        default:
                            return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_FARR3D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            break;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            break;
                        case 3:
                            this.#valueStack.push(arr[0][0].length);
                            break;
                        default:
                            return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_IARR1D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (dim === 1) {
                        this.#valueStack.push(arr.length);
                    } else {
                        return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_IARR2D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            break;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            break;
                        default:
                            return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_IARR3D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            break;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            break;
                        case 3:
                            this.#valueStack.push(arr[0][0].length);
                            break;
                        default:
                            return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_SARR1D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[];
                    if (dim === 1) {
                        this.#valueStack.push(arr.length);
                    } else {
                        return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_SARR2D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            break;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            break;
                        default:
                            return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_SARR3D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            break;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            break;
                        case 3:
                            this.#valueStack.push(arr[0][0].length);
                            break;
                        default:
                            return this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                break;
            case StdFunc.SEL_BOOLEAN:
                {
                    const falseValue = this.#valueStack.pop() as boolean;
                    const trueValue = this.#valueStack.pop() as boolean;
                    const testValue = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                break;
            case StdFunc.SEL_FLOAT:
                {
                    const falseValue = this.#valueStack.pop() as number;
                    const trueValue = this.#valueStack.pop() as number;
                    const testValue = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                break;
            case StdFunc.SEL_INTEGER:
                {
                    const falseValue = this.#valueStack.pop() as number;
                    const trueValue = this.#valueStack.pop() as number;
                    const testValue = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                break;
            case StdFunc.SEL_STRING:
                {
                    const falseValue = this.#valueStack.pop() as string;
                    const trueValue = this.#valueStack.pop() as string;
                    const testValue = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                break;
            case StdFunc.RANDOM:
                {
                    this.#valueStack.push(this.#rng.gen() >>> 1);
                }
                break;
            case StdFunc.LOG:
                {
                    const x = this.#valueStack.pop() as number;
                    const value = Math.log(x);
                    if (U.isInfinityOrNaN(value)) {
                        return this.#runtimeError(this.#pos-2, `wrong argument: log(${x})`);
                    }
                    this.#valueStack.push(value);
                }
                break;
            case StdFunc.LOG2:
                {
                    const x = this.#valueStack.pop() as number;
                    const value = Math.log2(x);
                    if (U.isInfinityOrNaN(value)) {
                        return this.#runtimeError(this.#pos-2, `wrong argument: log2(${x})`);
                    }
                    this.#valueStack.push(value);
                }
                break;
            case StdFunc.LOG10:
                {
                    const x = this.#valueStack.pop() as number;
                    const value = Math.log10(x);
                    if (U.isInfinityOrNaN(value)) {
                        return this.#runtimeError(this.#pos-2, `wrong argument: log10(${x})`);
                    }
                    this.#valueStack.push(value);
                }
                break;
            case StdFunc.WIDTH:
                {
                    this.#valueStack.push(this.#io.g.width);
                }
                break;
            case StdFunc.HEIGHT:
                {
                    this.#valueStack.push(this.#io.g.height);
                }
                break;
            default:
                throw new U.Unimplemented(StdFunc[stdfuncId]);
        }

        return RUNNING;
    }
}

export default Runner;