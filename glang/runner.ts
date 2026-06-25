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

export enum State {
    RUNNING,
    INTERRUPTED,
    ERROR,
    ENDED
};

export type RunnerResult = Result<State,RuntimeError>;

export enum PointerStateKind {
    NONE = 0,
    DOWN = 1,
    UP   = 2
}

export interface PointerState {
    x: number;
    y: number;
    kind: PointerStateKind;
    time: number;
}

export const DEFAULT_POINTER_STATE: Readonly<PointerState> = {
    x: 0,
    y: 0,
    kind: PointerStateKind.NONE,
    time: 0
};


export interface Gra {
    readonly width: number;
    readonly height: number;
    drawArc(left: number, top: number, diameter: number, startAngle: number, endAngle: number): void;
    drawLine(x1: number, y1: number, x2: number, y2: number): void;
    drawRect(left: number, top: number, width: number, height: number): void;
    fillArc(left: number, top: number, diameter: number, startAngle: number, endAngle: number): void;
    fillRect(left: number, top: number, width: number, height: number): void;
    setColor(r: number, g: number, b: number): void;
    flush(): void;
    transfer(): void;
}

export interface IO {
    readonly g: Gra;
    cerr(s: string): void;
    reqEventOfPointer(): void;
    getEventOfPointer(): Readonly<PointerState>;
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
    #error: RuntimeError | null = null;
    #state: State = State.RUNNING;
    #cmd: Cmd = Cmd.NOP;

    #awaitTime: number;

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
        this.#awaitTime = Date.now();
    }

    get isRunning(): boolean {
        return this.#isRunning;
    }

    get hasError(): boolean {
        return this.#error !== null;
    }

    get error(): RuntimeError | null {
        return this.#error;
    }

    get state(): State {
        return this.#state;
    }

    get lastCommand(): Cmd {
        return this.#cmd;
    }

    #findSource(addr: number): Source | undefined {
        const index = U.binarySearch(this.#sourceMap, (s => s.addr.min >= addr ));
        if (index !== undefined && this.#sourceMap[index].addr.include(addr)) {
            return this.#sourceMap[index];
        }
        return undefined;
    }    

    #runtimeError(addr: number, msg: string): void {
        const src = this.#findSource(addr);
        this.#error = new RuntimeError(msg, src);
        this.#state = State.ERROR;
        this.#isRunning = false;
    }

    step(): void {
        if (!this.#isRunning) {
            if (this.#state === State.INTERRUPTED) {
                this.#isRunning = true;
                this.#state = State.RUNNING;
            } else {
                return;
            }
        }
        this.#cmd = this.#program[this.#pos++];
        // log.dump("pos", this.#pos);
        // log.dump("cmd", Cmd[this.#cmd]);
        switch (this.#cmd) {
            case Cmd.NOP:
                {
                    this.#isRunning = false;
                    this.#state = State.INTERRUPTED;
                }
                return;
            case Cmd.END: 
                {
                    this.#isRunning = false;
                    this.#state = State.ENDED;
                }
                return;
            case Cmd.POP:
                {
                    this.#valueStack.pop();
                }
                return;
            case Cmd.DUP:
                {
                    this.#valueStack.push(this.#valueStack.at(-1)!);
                }
                return;
            case Cmd.DUPN:
                {
                    const N: number = this.#program[this.#pos++];
                    for (let i = 0; i < N; i++) {
                        this.#valueStack.push(this.#valueStack.at(-N)!);
                    }
                }
                return;
            case Cmd.SWAP:
                {
                    const oldTop = this.#valueStack.pop()!;
                    const newTop = this.#valueStack.pop()!;
                    this.#valueStack.push(oldTop);
                    this.#valueStack.push(newTop);
                }
                return;
            case Cmd.BPUSH_TRUE:
                {
                    this.#valueStack.push(true);
                }
                return;
            case Cmd.BPUSH_FALSE:
                {
                    this.#valueStack.push(false);
                }
                return;
            case Cmd.BNOT:
                {
                    const value = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(!value);
                }
                return;
            case Cmd.BAND:
                {
                    const right = this.#valueStack.pop() as boolean;
                    const left = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(left && right);
                }
                return;
            case Cmd.BOR:
                {
                    const right = this.#valueStack.pop() as boolean;
                    const left = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(left || right);
                }
                return;
            case Cmd.BEQ:
                {
                    const right = this.#valueStack.pop() as boolean;
                    const left = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(left === right);
                }
                return;
            case Cmd.BNE:
                {
                    const right = this.#valueStack.pop() as boolean;
                    const left = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(left !== right);
                }
                return;
            case Cmd.GET_BVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId] as boolean;
                    this.#valueStack.push(value);
                }
                return;
            case Cmd.SET_BVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    this.#block[blockId][blockVarId] = value;
                }
                return;
            case Cmd.GET_BARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[];
                    if (isValidIndex(arr, index1)) {
                        this.#valueStack.push(arr[index1]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                }
                return;
            case Cmd.SET_BARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[];
                    if (isValidIndex(arr, index1)) {
                        arr[index1] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                }
                return;
            case Cmd.GET_BARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][];
                    if (isValidIndex2(arr, index1, index2)) {
                        this.#valueStack.push(arr[index1][index2]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                }
                return;
            case Cmd.SET_BARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][];
                    if (isValidIndex2(arr, index1, index2)) {
                        arr[index1][index2] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                }
                return;
            case Cmd.GET_BARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][][];
                    if (isValidIndex3(arr, index1, index2, index3)) {
                        this.#valueStack.push(arr[index1][index2][index3]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                }
                return;
            case Cmd.SET_BARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][][];
                    if (isValidIndex3(arr, index1, index2, index3)) {
                        arr[index1][index2][index3] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                }
                return;
            case Cmd.FPUSH:
                {
                    const floatValue = this.#program[this.#pos++];
                    this.#valueStack.push(floatValue);
                }
                return;
            case Cmd.FADD:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left + right);
                }
                return;
            case Cmd.FSUB:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left - right);
                }
                return;
            case Cmd.FMUL:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left * right);
                }
                return;
            case Cmd.FDIV:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    const value = left / right;
                    if (U.isInfinityOrNaN(value)) {
                        this.#runtimeError(this.#pos-1, `wrong divide: ${left} / ${right}`);
                    } else {
                        this.#valueStack.push(value);
                    }
                }
                return;
            case Cmd.FNEGA:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(-value);
                }
                return;
            case Cmd.FEQ:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left === right);
                }
                return;
            case Cmd.FNE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left !== right);
                }
                return;
            case Cmd.FLT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left < right);
                }
                return;
            case Cmd.FLE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left <= right);
                }
                return;
            case Cmd.FGT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left > right);
                }
                return;
            case Cmd.FGE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left >= right);
                }
                return;
            case Cmd.GET_FVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId] as number;
                    this.#valueStack.push(value);
                }
                return;
            case Cmd.SET_FVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    this.#block[blockId][blockVarId] = value;
                }
                return;
            case Cmd.GET_FARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (isValidIndex(arr, index1)) {
                        this.#valueStack.push(arr[index1]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                }
                return;
            case Cmd.SET_FARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (isValidIndex(arr, index1)) {
                        arr[index1] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                }
                return;
            case Cmd.GET_FARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    if (isValidIndex2(arr, index1, index2)) {
                        this.#valueStack.push(arr[index1][index2]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                }
                return;
            case Cmd.SET_FARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    if (isValidIndex2(arr, index1, index2)) {
                        arr[index1][index2] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                }
                return;
            case Cmd.GET_FARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    if (isValidIndex3(arr, index1, index2, index3)) {
                        this.#valueStack.push(arr[index1][index2][index3]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                }
                return;
            case Cmd.SET_FARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    if (isValidIndex3(arr, index1, index2, index3)) {
                        arr[index1][index2][index3] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                }
                return;
            case Cmd.IPUSH:
                {
                    const intValue = this.#program[this.#pos++];
                    this.#valueStack.push(intValue);
                    // log.dump("intValue", intValue);
                }
                return;
            case Cmd.IADD:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push((left + right) & 0xFFFFFFFF);
                }
                return;
            case Cmd.ISUB:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push((left - right) & 0xFFFFFFFF);
                }
                return;
            case Cmd.IMUL:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.imul(left, right));
                }
                return;
            case Cmd.IDIV:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    const value = left / right;
                    if (U.isInfinityOrNaN(value)) {
                        this.#runtimeError(this.#pos-1, `wrong divide: ${left} / ${right}`);
                    } else {
                        this.#valueStack.push(Math.trunc(value));
                    }
                }
                return;
            case Cmd.IREM:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    const value = left % right;
                    if (U.isInfinityOrNaN(value)) {
                        this.#runtimeError(this.#pos-1, `wrong divide: ${left} % ${right}`);
                    } else {
                        this.#valueStack.push(value);
                    }
                }
                return;
            case Cmd.INEGA:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(-value);
                }
                return;
            case Cmd.IASHIFTL:
                {
                    const right = this.#valueStack.pop() as number & 31;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(0xFFFFFFFF & ((0x80000000 & left) | (left << right)));
                }
                return;
            case Cmd.IASHIFTR:
                {
                    const right = this.#valueStack.pop() as number & 31;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(0xFFFFFFFF & (left >> right));
                }
                return;
            case Cmd.ILSHIFTL:
                {
                    const right = this.#valueStack.pop() as number & 31;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(0xFFFFFFFF & (left << right));
                }
                return;
            case Cmd.ILSHIFTR:
                {
                    const right = this.#valueStack.pop() as number & 31;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(0xFFFFFFFF & (left >>> right));
                }
                return;
            case Cmd.INOT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(0xFFFFFFFF & (~value));
                }
                return;
            case Cmd.IAND:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left & right);
                }
                return;
            case Cmd.IOR:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left | right);
                }
                return;
            case Cmd.IXOR:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left ^ right);
                }
                return;
            case Cmd.IEQ:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left === right);
                }
                return;
            case Cmd.INE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left !== right);
                }
                return;
            case Cmd.ILT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left < right);
                }
                return;
            case Cmd.ILE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left <= right);
                }
                return;
            case Cmd.IGT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left > right);
                }
                return;
            case Cmd.IGE:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(left >= right);
                }
                return;
            case Cmd.GET_IVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId] as number;
                    this.#valueStack.push(value);
                }
                return;                
            case Cmd.SET_IVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    this.#block[blockId][blockVarId] = value;
                }
                return;
            case Cmd.GET_IARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (isValidIndex(arr, index1)) {
                        this.#valueStack.push(arr[index1]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                }
                return;
            case Cmd.SET_IARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (isValidIndex(arr, index1)) {
                        arr[index1] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                }
                return;
            case Cmd.GET_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    if (isValidIndex2(arr, index1, index2)) {
                        this.#valueStack.push(arr[index1][index2]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                }
                return;
            case Cmd.SET_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    if (isValidIndex2(arr, index1, index2)) {
                        arr[index1][index2] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                }
                return;
            case Cmd.GET_IARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    if (isValidIndex3(arr, index1, index2, index3)) {
                        this.#valueStack.push(arr[index1][index2][index3]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                }
                return;
            case Cmd.SET_IARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as number;
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    if (isValidIndex3(arr, index1, index2, index3)) {
                        arr[index1][index2][index3] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                }
                return;
            case Cmd.SPUSH:
                {
                    const litStrId = this.#program[this.#pos++];
                    const value = this.#litStrPool[litStrId];
                    this.#valueStack.push(value);
                }
                return;
            case Cmd.SCONCAT:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left + right);
                }
                return;
            case Cmd.SEQ:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left === right);
                }
                return;
            case Cmd.SNE:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left !== right);
                }
                return;
            case Cmd.SLT:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left < right);
                }
                return;
            case Cmd.SLE:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left <= right);
                }
                return;
            case Cmd.SGT:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left > right);
                }
                return;
            case Cmd.SGE:
                {
                    const right = this.#valueStack.pop() as string;
                    const left = this.#valueStack.pop() as string;
                    this.#valueStack.push(left >= right);
                }
                return;
            case Cmd.GET_SVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId] as string;
                    this.#valueStack.push(value);
                }
                return;
            case Cmd.SET_SVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as string;
                    this.#block[blockId][blockVarId] = value;
                }
                return;
            case Cmd.GET_SARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[];
                    if (isValidIndex(arr, index1)) {
                        this.#valueStack.push(arr[index1]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                }
                return;
            case Cmd.SET_SARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as string;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[];
                    if (isValidIndex(arr, index1)) {
                        arr[index1] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}]`);
                    }
                }
                return;
            case Cmd.GET_SARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][];
                    if (isValidIndex2(arr, index1, index2)) {
                        this.#valueStack.push(arr[index1][index2]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                }
                return;
            case Cmd.SET_SARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as string;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][];
                    if (isValidIndex2(arr, index1, index2)) {
                        arr[index1][index2] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}]`);
                    }
                }
                return;
            case Cmd.GET_SARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][][];
                    if (isValidIndex3(arr, index1, index2, index3)) {
                        this.#valueStack.push(arr[index1][index2][index3]);
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                }
                return;
            case Cmd.SET_SARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as string;
                    const index3 = this.#valueStack.pop() as number;
                    const index2 = this.#valueStack.pop() as number;
                    const index1 = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][][];
                    if (isValidIndex3(arr, index1, index2, index3)) {
                        arr[index1][index2][index3] = value;
                    } else {
                        this.#runtimeError(this.#pos-3, `index out of bound: [${index1}][${index2}][${index3}]`);
                    }
                }
                return;
            case Cmd.APUSH_BARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_BARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_BARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_FARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_FARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_FARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_IARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_IARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_SARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_SARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.APUSH_SARR3D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                return;
            case Cmd.INIT_BARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<boolean>(size1).fill(false);
                }
                return;
            case Cmd.INIT_BARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<boolean[]>(size1).fill([]).map( () => new Array<boolean>(size2).fill(false) );
                }
                return;
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
                return;
            case Cmd.INIT_FARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<number>(size1).fill(0.0);
                }
                return;
            case Cmd.INIT_FARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<number[]>(size1).fill([]).map( () => new Array<number>(size2).fill(0) );
                }
                return;
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
                return;
            case Cmd.INIT_IARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<number>(size1).fill(0);
                }
                return;
            case Cmd.INIT_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<number[]>(size1).fill([]).map( () => new Array<number>(size2).fill(0) );
                }
                return;
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
                return;
            case Cmd.INIT_SARR1D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<string>(size1).fill("");
                }
                return;
            case Cmd.INIT_SARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array<string[]>(size1).fill([]).map( () => new Array<string>(size2).fill("") );
                }
                return;
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
                return;
            case Cmd.JUMP:
                {
                    const addr = this.#program[this.#pos++];
                    this.#pos = addr;
                }
                return;
            case Cmd.JUMP_IF_TRUE:
                {
                    const addr = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    if (value) {
                        this.#pos = addr;
                    }
                }
                return;
            case Cmd.JUMP_IF_FALSE:
                {
                    const addr = this.#program[this.#pos++];
                    const value = this.#valueStack.pop() as boolean;
                    if (!value) {
                        this.#pos = addr;
                    }
                }
                return;
            case Cmd.CALL_STDFUNC:
                {
                    const stdfuncId = this.#program[this.#pos++] as StdFunc;
                    this.#callStdfunc(stdfuncId);
                }
                return;
            case Cmd.CALL_USERFUNC:
                {
                    const userfuncAddress = this.#program[this.#pos++];
                    const returnAddress = this.#program[this.#pos++];
                    this.#pos = userfuncAddress;
                    this.#addressStack.push(returnAddress);
                }
                return;
            case Cmd.RET:
                {
                    const addr = this.#addressStack.pop()!;
                    this.#pos = addr;
                }
                return;
            case Cmd.PUSH_BLOCK:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarCount = this.#program[this.#pos++];
                    this.#blockStack[blockId].push(this.#block[blockId]);
                    this.#block[blockId] = new Array(blockVarCount).fill(undefined);
                }
                return;
            case Cmd.POP_BLOCK:
                {
                    const blockId = this.#program[this.#pos++];
                    this.#block[blockId] = this.#blockStack[blockId].pop()!;
                }
                return;
            case Cmd.PRINT:
                {
                    const N = this.#program[this.#pos++];
                    const arr = this.#valueStack.splice(-N).map( e => `${e}` );
                    this.#io.cerr(arr.join(" "));
                }
                return;
            case Cmd.DRAW_LINE:
                {
                    const y2 = this.#valueStack.pop() as number;
                    const x2 = this.#valueStack.pop() as number;
                    const y1 = this.#valueStack.pop() as number;
                    const x1 = this.#valueStack.pop() as number;
                    this.#io.g.drawLine(x1, y1, x2, y2);
                }
                return;
            case Cmd.SET_COLOR:
                {
                    const b = this.#valueStack.pop() as number;
                    const g = this.#valueStack.pop() as number;
                    const r = this.#valueStack.pop() as number;
                    this.#io.g.setColor(r, g, b);
                }
                return;
            case Cmd.RANDOMIZE_TIME:
                {
                    const seed = Date.now();
                    this.#rng.setSeed(seed);
                }
                return;
            case Cmd.RANDOMIZE_SEED:
                {
                    const seed = this.#valueStack.pop() as number;
                    this.#rng.setSeed(seed);
                }
                return;
            case Cmd.REQ_POINTER_EV:
                {
                    this.#io.reqEventOfPointer();
                    this.#isRunning = false;
                    this.#state = State.INTERRUPTED;
                }
                return;
            case Cmd.GET_POINTER_EV:
                {
                    const xBId = this.#program[this.#pos++];
                    const xBVarId = this.#program[this.#pos++];
                    const yBId = this.#program[this.#pos++];
                    const yBVarId = this.#program[this.#pos++];
                    const kindBId = this.#program[this.#pos++];
                    const kindBVarId = this.#program[this.#pos++];
                    const timeBId = this.#program[this.#pos++];
                    const timeBVarId = this.#program[this.#pos++];
                    const pstate = this.#io.getEventOfPointer();
                    this.#block[xBId][xBVarId] = Math.floor(pstate.x);
                    this.#block[yBId][yBVarId] = Math.floor(pstate.y);
                    this.#block[kindBId][kindBVarId] = pstate.kind as number;
                    this.#block[timeBId][timeBVarId] = pstate.time;
                }
                return;
            case Cmd.FLUSH:
                {
                    this.#io.g.flush();
                }
                return;
            case Cmd.TRANSFER:
                {
                    this.#io.g.transfer();
                }
                return;
            case Cmd.AWAIT:
                {
                    const waitTime = this.#program[this.#pos++];
                    const now = Date.now();
                    const diff = (this.#awaitTime + waitTime) - now;
                    if (diff <= 0) {
                        this.#awaitTime = now;
                    } else {
                        this.#pos -= 2;
                        if (diff > 200) {
                            this.#isRunning = false;
                            this.#state = State.INTERRUPTED;
                        }
                    }
                }
                return;
            case Cmd.DRAW_RECT:
                {
                    const height = this.#valueStack.pop() as number;
                    const width = this.#valueStack.pop() as number;
                    const top = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#io.g.drawRect(left, top, width, height);
                }
                return;
            case Cmd.DRAW_ARC:
                {
                    const endAngle = this.#valueStack.pop() as number;
                    const startAngle = this.#valueStack.pop() as number;
                    const diameter = this.#valueStack.pop() as number;
                    const top = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#io.g.drawArc(left, top, diameter, startAngle, endAngle);
                }
                return;
            case Cmd.FILL_RECT:
                {
                    const height = this.#valueStack.pop() as number;
                    const width = this.#valueStack.pop() as number;
                    const top = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#io.g.fillRect(left, top, width, height);
                }
                return;
            case Cmd.FILL_ARC:
                {
                    const endAngle = this.#valueStack.pop() as number;
                    const startAngle = this.#valueStack.pop() as number;
                    const diameter = this.#valueStack.pop() as number;
                    const top = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#io.g.fillArc(left, top, diameter, startAngle, endAngle);
                }
                return;
            default:
                throw new U.Unimplemented(Cmd[this.#cmd]);
        }
    }

    #callStdfunc(stdfuncId: StdFunc): void {
        // log.dump("stdfuncId", StdFunc[stdfuncId]);
        switch (stdfuncId) {
            case StdFunc.CBOOL_FROM_BOOLEAN:
                // 処理不要.
                return;
            case StdFunc.CBOOL_FROM_FLOAT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(value != 0.0);
                }
                return;
            case StdFunc.CBOOL_FROM_INTEGER:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(value !== 0);
                }
                return;
            case StdFunc.CBOOL_FROM_STRING:
                {
                    const value = this.#valueStack.pop() as string;
                    this.#valueStack.push(value.length > 0);
                }
                return;
            case StdFunc.CFLOAT_FROM_BOOLEAN:
                {
                    const value = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(value ? 1.0 : 0.0);
                }
                return;
            case StdFunc.CFLOAT_FROM_FLOAT:
                // 処理不要.
                return;
            case StdFunc.CFLOAT_FROM_INTEGER:
                // 処理不要.
                return;
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
                return;
            case StdFunc.CINT_FROM_BOOLEAN:
                {
                    const value = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(value ? 1 : 0);
                }
                return;
            case StdFunc.CINT_FROM_FLOAT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.imul(value, 1));
                }
                return;
            case StdFunc.CINT_FROM_INTEGER:
                // 処理不要.
                return;
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
                return;
            case StdFunc.CSTR_FROM_BOOLEAN:
                {
                    const value = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(`${value}`);
                }
                return;
            case StdFunc.CSTR_FROM_FLOAT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(`${value}`);
                }
                return;
            case StdFunc.CSTR_FROM_INTEGER:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(`${value}`);
                }
                return;
            case StdFunc.CSTR_FROM_STRING:
                // 処理不要.
                return;
            case StdFunc.SIN:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.sin(value));
                }
                return;
            case StdFunc.COS:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.cos(value));
                }
                return;
            case StdFunc.TAN:
                {
                    const value = this.#valueStack.pop() as number;
                    const tanValue = Math.tan(value);
                    if (U.isInfinityOrNaN(tanValue)) {
                        return this.#runtimeError(this.#pos-2, `wrong tan argument: tan(${value})`);
                    }
                    this.#valueStack.push(tanValue);
                }
                return;

            case StdFunc.ABS_FLOAT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.abs(value));
                }
                return;
            case StdFunc.ABS_INTGER:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.abs(value));
                }
                return;
            case StdFunc.SIGN_FLOAT:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.sign(value));
                }
                return;
            case StdFunc.SIGN_INTEGER:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.sign(value));
                }
                return;
            case StdFunc.MIN_FLOAT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.min(left, right));
                }
                return;
            case StdFunc.MIN_INTEGER:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.min(left, right));
                }
                return;
            case StdFunc.MAX_FLOAT:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.max(left, right));
                }
                return;
            case StdFunc.MAX_INTEGER:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.max(left, right));
                }
                return;
            case StdFunc.POW:
                {
                    const right = this.#valueStack.pop() as number;
                    const left = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.pow(left, right));
                }
                return;
            case StdFunc.SQRT:
                {
                    const value = this.#valueStack.pop() as number;
                    const sqrtValue = Math.sqrt(value);
                    if (U.isInfinityOrNaN(sqrtValue)) {
                        this.#runtimeError(this.#pos-2, `wrong sqrt argument: sqrt(${value})`);
                    } else {
                        this.#valueStack.push(sqrtValue);
                    }
                }
                return;
            case StdFunc.FLOOR:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.floor(value));
                }
                return;
            case StdFunc.CEIL:
                {
                    const value = this.#valueStack.pop() as number;
                    this.#valueStack.push(Math.ceil(value));
                }
                return;
            case StdFunc.SIZE_BARR1D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[];
                    if (dim === 1) {
                        this.#valueStack.push(arr.length);
                    } else {
                        this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_BARR2D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            return;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            return;
                        default:
                            this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_BARR3D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as boolean[][][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            return;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            return;
                        case 3:
                            this.#valueStack.push(arr[0][0].length);
                            return;
                        default:
                            this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_FARR1D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (dim === 1) {
                        this.#valueStack.push(arr.length);
                    } else {
                        this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_FARR2D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            return;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            return;
                        default:
                            this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_FARR3D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            return;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            return;
                        case 3:
                            this.#valueStack.push(arr[0][0].length);
                            return;
                        default:
                            this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_IARR1D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[];
                    if (dim === 1) {
                        this.#valueStack.push(arr.length);
                    } else {
                        this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_IARR2D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            return;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            return;
                        default:
                            this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_IARR3D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as number[][][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            return;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            return;
                        case 3:
                            this.#valueStack.push(arr[0][0].length);
                            return;
                        default:
                            this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_SARR1D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[];
                    if (dim === 1) {
                        this.#valueStack.push(arr.length);
                    } else {
                        this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_SARR2D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            return;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            return;
                        default:
                            this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SIZE_SARR3D:
                {
                    const dim = this.#valueStack.pop() as number;
                    const blockVarId = this.#valueStack.pop() as number;
                    const blockId = this.#valueStack.pop() as number;
                    const arr = this.#block[blockId][blockVarId] as string[][][];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            return;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            return;
                        case 3:
                            this.#valueStack.push(arr[0][0].length);
                            return;
                        default:
                            this.#runtimeError(this.#pos-2, `wrong dimension: size(*,${dim})`);
                    }
                }
                return;
            case StdFunc.SEL_BOOLEAN:
                {
                    const falseValue = this.#valueStack.pop() as boolean;
                    const trueValue = this.#valueStack.pop() as boolean;
                    const testValue = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                return;
            case StdFunc.SEL_FLOAT:
                {
                    const falseValue = this.#valueStack.pop() as number;
                    const trueValue = this.#valueStack.pop() as number;
                    const testValue = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                return;
            case StdFunc.SEL_INTEGER:
                {
                    const falseValue = this.#valueStack.pop() as number;
                    const trueValue = this.#valueStack.pop() as number;
                    const testValue = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                return;
            case StdFunc.SEL_STRING:
                {
                    const falseValue = this.#valueStack.pop() as string;
                    const trueValue = this.#valueStack.pop() as string;
                    const testValue = this.#valueStack.pop() as boolean;
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                return;
            case StdFunc.RANDOM:
                {
                    this.#valueStack.push(this.#rng.gen() >>> 1);
                }
                return;
            case StdFunc.LOG:
                {
                    const x = this.#valueStack.pop() as number;
                    const value = Math.log(x);
                    if (U.isInfinityOrNaN(value)) {
                        this.#runtimeError(this.#pos-2, `wrong argument: log(${x})`);
                    } else {
                        this.#valueStack.push(value);
                    }
                }
                return;
            case StdFunc.LOG2:
                {
                    const x = this.#valueStack.pop() as number;
                    const value = Math.log2(x);
                    if (U.isInfinityOrNaN(value)) {
                        this.#runtimeError(this.#pos-2, `wrong argument: log2(${x})`);
                    } else {
                        this.#valueStack.push(value);
                    }
                }
                return;
            case StdFunc.LOG10:
                {
                    const x = this.#valueStack.pop() as number;
                    const value = Math.log10(x);
                    if (U.isInfinityOrNaN(value)) {
                        this.#runtimeError(this.#pos-2, `wrong argument: log10(${x})`);
                    } else {
                        this.#valueStack.push(value);
                    }
                }
                return;
            case StdFunc.WIDTH:
                {
                    this.#valueStack.push(this.#io.g.width);
                }
                return;
            case StdFunc.HEIGHT:
                {
                    this.#valueStack.push(this.#io.g.height);
                }
                return;
            default:
                throw new U.Unimplemented(StdFunc[stdfuncId]);
        }
    }
}

export default Runner;