//
// Runner
// 
import Logger, { LogLevel } from "logger";
const log = new Logger("runner", LogLevel.ALL);
import { Cmd, StdFunc } from "command";
import { Result } from "utils";
import * as U from "utils";
export class RuntimeError {
    msg;
    src;
    constructor(msg, src) {
        this.msg = msg;
        this.src = src;
    }
    toString() {
        return `RuntimeError{ msg: ${this.msg}, src: ${this.src} }`;
    }
}
const RUNNING = Result.ok(true);
const ENDED = Result.ok(false);
export class Runner {
    #program;
    #litStrPool;
    #io;
    #sourceMap;
    #pos = 0;
    #isRunning = true;
    #error = U.Option.none();
    #block;
    #blockStack;
    #valueStack = [];
    #addressStack = [];
    constructor(program, io) {
        this.#program = program.program;
        this.#litStrPool = program.litStrPool;
        this.#sourceMap = program.sourceMap;
        this.#block = new Array(program.totalBlockCount).fill([]).map(() => []);
        this.#blockStack = new Array(program.totalBlockCount).fill([]).map(() => []);
        this.#io = io;
    }
    #findSource(addr) {
        const index = U.binarySearch(this.#sourceMap, (s => s.addr.min >= addr));
        if (index !== undefined && this.#sourceMap[index].addr.include(addr)) {
            return this.#sourceMap[index];
        }
        return undefined;
    }
    #runtimeError(addr, msg) {
        const src = this.#findSource(addr);
        const err = Result.err(new RuntimeError(msg, src));
        this.#error = U.Option.some(err);
        this.#isRunning = false;
        return err;
    }
    step() {
        if (!this.#isRunning) {
            return this.#error.getOr(ENDED);
        }
        const cmd = this.#program[this.#pos++];
        log.dump("pos", this.#pos);
        log.dump("cmd", Cmd[cmd]);
        switch (cmd) {
            case Cmd.NOP:
                throw new Error("bug");
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
                    this.#valueStack.push(this.#valueStack.at(-1));
                }
                break;
            case Cmd.DUPN:
                {
                    const N = this.#program[this.#pos++];
                    for (let i = 0; i < N; i++) {
                        this.#valueStack.push(this.#valueStack.at(-N));
                    }
                }
                break;
            case Cmd.SWAP:
                {
                    const oldTop = this.#valueStack.pop();
                    const newTop = this.#valueStack.pop();
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
            case Cmd.BAND:
                throw new U.Unimplemented(Cmd[cmd]);
            case Cmd.BOR:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left || right);
                }
                break;
            case Cmd.BEQ:
            case Cmd.BNE:
            case Cmd.GET_BVAR:
            case Cmd.SET_BVAR:
            case Cmd.GET_BARR1D:
            case Cmd.SET_BARR1D:
            case Cmd.GET_BARR2D:
            case Cmd.SET_BARR2D:
            case Cmd.GET_BARR3D:
            case Cmd.SET_BARR3D:
                throw new U.Unimplemented(Cmd[cmd]);
            case Cmd.FPUSH:
                {
                    const floatValue = this.#program[this.#pos++];
                    this.#valueStack.push(floatValue);
                }
                break;
            case Cmd.FADD:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left + right);
                }
                break;
            case Cmd.FSUB:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left - right);
                }
                break;
            case Cmd.FMUL:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left * right);
                }
                break;
            case Cmd.FDIV:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    const value = left / right;
                    if (U.isInfinityOrNaN(value)) {
                        return this.#runtimeError(this.#pos - 1, `wrong divide: ${left} / ${right}`);
                    }
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.FNEGA:
            case Cmd.FEQ:
            case Cmd.FNE:
            case Cmd.FLT:
            case Cmd.FLE:
            case Cmd.FGT:
            case Cmd.FGE:
            case Cmd.GET_FVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId];
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.SET_FVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop();
                    this.#block[blockId][blockVarId] = value;
                }
                break;
            case Cmd.GET_FARR1D:
            case Cmd.SET_FARR1D:
            case Cmd.GET_FARR2D:
            case Cmd.SET_FARR2D:
            case Cmd.GET_FARR3D:
            case Cmd.SET_FARR3D:
                throw new U.Unimplemented(Cmd[cmd]);
            case Cmd.IPUSH:
                {
                    const intValue = this.#program[this.#pos++];
                    this.#valueStack.push(intValue);
                }
                break;
            case Cmd.IADD:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push((left + right) & 0xFFFFFFFF);
                }
                break;
            case Cmd.ISUB:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push((left - right) & 0xFFFFFFFF);
                }
                break;
            case Cmd.IMUL:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(Math.imul(left, right));
                }
                break;
            case Cmd.IDIV:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    const value = left / right;
                    if (U.isInfinityOrNaN(value)) {
                        return this.#runtimeError(this.#pos - 1, `wrong divide: ${left} / ${right}`);
                    }
                    this.#valueStack.push(Math.trunc(value));
                }
                break;
            case Cmd.IREM:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    const value = left % right;
                    if (U.isInfinityOrNaN(value)) {
                        return this.#runtimeError(this.#pos - 1, `wrong divide: ${left} % ${right}`);
                    }
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.INEGA:
            case Cmd.IASHIFTL:
            case Cmd.IASHIFTR:
            case Cmd.ILSHIFTL:
            case Cmd.ILSHIFTR:
            case Cmd.INOT:
            case Cmd.IAND:
            case Cmd.IOR:
            case Cmd.IXOR:
                throw new U.Unimplemented(Cmd[cmd]);
            case Cmd.IEQ:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left === right);
                }
                break;
            case Cmd.INE:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left !== right);
                }
                break;
            case Cmd.ILT:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left < right);
                }
                break;
            case Cmd.ILE:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left <= right);
                }
                break;
            case Cmd.IGT:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left > right);
                }
                break;
            case Cmd.IGE:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left >= right);
                }
                break;
            case Cmd.GET_IVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId];
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.SET_IVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop();
                    this.#block[blockId][blockVarId] = value;
                }
                break;
            case Cmd.GET_IARR1D:
            case Cmd.SET_IARR1D:
                throw new U.Unimplemented(Cmd[cmd]);
            case Cmd.GET_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const index2 = this.#valueStack.pop();
                    const index1 = this.#valueStack.pop();
                    const arr = this.#block[blockId][blockVarId];
                    const value = arr.at(index1)?.at(index2);
                    if (value === undefined) {
                        return this.#runtimeError(this.#pos - 3, `index out of bound: [${index1}][${index2}]`);
                    }
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.SET_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop();
                    const index2 = this.#valueStack.pop();
                    const index1 = this.#valueStack.pop();
                    const arr = this.#block[blockId][blockVarId];
                    if (arr.at(index1)?.at(index2) === undefined) {
                        return this.#runtimeError(this.#pos - 3, `index out of bound: [${index1}][${index2}]`);
                    }
                    arr[index1][index2] = value;
                }
                break;
            case Cmd.GET_IARR3D:
            case Cmd.SET_IARR3D:
                throw new U.Unimplemented(Cmd[cmd]);
            case Cmd.SPUSH:
                {
                    const litStrId = this.#program[this.#pos++];
                    const value = this.#litStrPool[litStrId];
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.SCONCAT:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(left + right);
                }
                break;
            case Cmd.SEQ:
            case Cmd.SNE:
            case Cmd.SLT:
            case Cmd.SLE:
            case Cmd.SGT:
            case Cmd.SGE:
                throw new U.Unimplemented(Cmd[cmd]);
            case Cmd.GET_SVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#block[blockId][blockVarId];
                    this.#valueStack.push(value);
                }
                break;
            case Cmd.SET_SVAR:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const value = this.#valueStack.pop();
                    this.#block[blockId][blockVarId] = value;
                }
                break;
            case Cmd.GET_SARR1D:
            case Cmd.SET_SARR1D:
            case Cmd.GET_SARR2D:
            case Cmd.SET_SARR2D:
            case Cmd.GET_SARR3D:
            case Cmd.SET_SARR3D:
            case Cmd.APUSH_BARR1D:
            case Cmd.APUSH_BARR2D:
            case Cmd.APUSH_BARR3D:
            case Cmd.APUSH_FARR1D:
            case Cmd.APUSH_FARR2D:
            case Cmd.APUSH_FARR3D:
            case Cmd.APUSH_IARR1D:
                throw new U.Unimplemented(Cmd[cmd]);
            case Cmd.APUSH_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    this.#valueStack.push(blockId, blockVarId);
                }
                break;
            case Cmd.APUSH_IARR3D:
            case Cmd.APUSH_SARR1D:
            case Cmd.APUSH_SARR2D:
            case Cmd.APUSH_SARR3D:
            case Cmd.INIT_BARR1D:
            case Cmd.INIT_BARR2D:
            case Cmd.INIT_BARR3D:
            case Cmd.INIT_FARR1D:
            case Cmd.INIT_FARR2D:
            case Cmd.INIT_FARR3D:
            case Cmd.INIT_IARR1D:
                throw new U.Unimplemented(Cmd[cmd]);
            case Cmd.INIT_IARR2D:
                {
                    const blockId = this.#program[this.#pos++];
                    const blockVarId = this.#program[this.#pos++];
                    const size1 = this.#program[this.#pos++];
                    const size2 = this.#program[this.#pos++];
                    this.#block[blockId][blockVarId] = new Array(size1).fill([]).map(() => new Array(size2).fill(0));
                }
                break;
            case Cmd.INIT_IARR3D:
            case Cmd.INIT_SARR1D:
            case Cmd.INIT_SARR2D:
            case Cmd.INIT_SARR3D:
                throw new U.Unimplemented(Cmd[cmd]);
            case Cmd.JUMP:
                {
                    const addr = this.#program[this.#pos++];
                    this.#pos = addr;
                }
                break;
            case Cmd.JUMP_IF_TRUE:
                {
                    const addr = this.#program[this.#pos++];
                    const value = this.#valueStack.pop();
                    if (value) {
                        this.#pos = addr;
                    }
                }
                break;
            case Cmd.JUMP_IF_FALSE:
                {
                    const addr = this.#program[this.#pos++];
                    const value = this.#valueStack.pop();
                    if (!value) {
                        this.#pos = addr;
                    }
                }
                break;
            case Cmd.CALL_STDFUNC:
                {
                    const stdfuncId = this.#program[this.#pos++];
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
                    const addr = this.#addressStack.pop();
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
                    this.#block[blockId] = this.#blockStack[blockId].pop();
                }
                break;
            case Cmd.PRINT:
                {
                    const N = this.#program[this.#pos++];
                    const arr = this.#valueStack.splice(-N).map(e => `${e}`);
                    this.#io.stderr(arr.join(" "));
                }
                break;
            default:
                throw new U.Unimplemented(Cmd[cmd]);
        }
        return RUNNING;
    }
    #callStdfunc(stdfuncId) {
        log.dump("stdfuncId", StdFunc[stdfuncId]);
        switch (stdfuncId) {
            case StdFunc.CBOOL_FROM_BOOLEAN:
                // 処理不要.
                break;
            case StdFunc.CBOOL_FROM_FLOAT:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(value != 0.0);
                }
                break;
            case StdFunc.CBOOL_FROM_INTEGER:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(value !== 0);
                }
                break;
            case StdFunc.CBOOL_FROM_STRING:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(value.length > 0);
                }
                break;
            case StdFunc.CFLOAT_FROM_BOOLEAN:
                {
                    const value = this.#valueStack.pop();
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
                    const strValue = this.#valueStack.pop();
                    const floatValue = parseFloat(strValue);
                    if (U.isInfinityOrNaN(floatValue)) {
                        this.#valueStack.push(0.0);
                    }
                    else {
                        this.#valueStack.push(floatValue);
                    }
                }
                break;
            case StdFunc.CINT_FROM_BOOLEAN:
                throw new U.Unimplemented(StdFunc[stdfuncId]);
            case StdFunc.CINT_FROM_FLOAT:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(Math.imul(value, 1));
                }
                break;
            case StdFunc.CINT_FROM_INTEGER:
                // 処理不要.
                break;
            case StdFunc.CINT_FROM_STRING:
                {
                    const strValue = this.#valueStack.pop();
                    const intValue = parseInt(strValue);
                    if (U.isInfinityOrNaN(intValue)) {
                        this.#valueStack.push(0);
                    }
                    else {
                        this.#valueStack.push(intValue);
                    }
                }
                break;
            case StdFunc.CSTR_FROM_BOOLEAN:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(`${value}`);
                }
                break;
            case StdFunc.CSTR_FROM_FLOAT:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(`${value}`);
                }
                break;
            case StdFunc.CSTR_FROM_INTEGER:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(`${value}`);
                }
                break;
            case StdFunc.CSTR_FROM_STRING:
                // 処理不要.
                break;
            case StdFunc.SIN:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(Math.sin(value));
                }
                break;
            case StdFunc.COS:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(Math.cos(value));
                }
                break;
            case StdFunc.TAN:
                {
                    const value = this.#valueStack.pop();
                    const tanValue = Math.tan(value);
                    if (U.isInfinityOrNaN(tanValue)) {
                        return this.#runtimeError(this.#pos - 2, `wrong tan argument: tan(${value})`);
                    }
                    this.#valueStack.push(tanValue);
                }
                break;
            case StdFunc.ABS_FLOAT:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(Math.abs(value));
                }
                break;
            case StdFunc.ABS_INTGER:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(Math.abs(value));
                }
                break;
            case StdFunc.SIGN_FLOAT:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(Math.sign(value));
                }
                break;
            case StdFunc.SIGN_INTEGER:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(Math.sign(value));
                }
                break;
            case StdFunc.MIN_FLOAT:
                throw new U.Unimplemented(StdFunc[stdfuncId]);
            case StdFunc.MIN_INTEGER:
                {
                    const right = this.#valueStack.pop();
                    const left = this.#valueStack.pop();
                    this.#valueStack.push(Math.min(left, right));
                }
                break;
            case StdFunc.MAX_FLOAT:
            case StdFunc.MAX_INTEGER:
            case StdFunc.POW:
            case StdFunc.SQRT:
                throw new U.Unimplemented(StdFunc[stdfuncId]);
            case StdFunc.FLOOR:
                {
                    const value = this.#valueStack.pop();
                    this.#valueStack.push(Math.floor(value));
                }
                break;
            case StdFunc.CEIL:
            case StdFunc.SIZE_BARR1D:
            case StdFunc.SIZE_BARR2D:
            case StdFunc.SIZE_BARR3D:
            case StdFunc.SIZE_FARR1D:
            case StdFunc.SIZE_FARR2D:
            case StdFunc.SIZE_FARR3D:
            case StdFunc.SIZE_IARR1D:
                throw new U.Unimplemented(StdFunc[stdfuncId]);
            case StdFunc.SIZE_IARR2D:
                {
                    const dim = this.#valueStack.pop();
                    const blockVarId = this.#valueStack.pop();
                    const blockId = this.#valueStack.pop();
                    const arr = this.#block[blockId][blockVarId];
                    switch (dim) {
                        case 1:
                            this.#valueStack.push(arr.length);
                            break;
                        case 2:
                            this.#valueStack.push(arr[0].length);
                            break;
                        default:
                            return this.#runtimeError(this.#pos - 3, `wrong argument stdfunc size(${dim})`);
                    }
                }
                break;
            case StdFunc.SIZE_IARR3D:
            case StdFunc.SIZE_SARR1D:
            case StdFunc.SIZE_SARR2D:
            case StdFunc.SIZE_SARR3D:
                throw new U.Unimplemented(StdFunc[stdfuncId]);
            case StdFunc.SEL_BOOLEAN:
                {
                    const falseValue = this.#valueStack.pop();
                    const trueValue = this.#valueStack.pop();
                    const testValue = this.#valueStack.pop();
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                break;
            case StdFunc.SEL_FLOAT:
                {
                    const falseValue = this.#valueStack.pop();
                    const trueValue = this.#valueStack.pop();
                    const testValue = this.#valueStack.pop();
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                break;
            case StdFunc.SEL_INTEGER:
                {
                    const falseValue = this.#valueStack.pop();
                    const trueValue = this.#valueStack.pop();
                    const testValue = this.#valueStack.pop();
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                break;
            case StdFunc.SEL_STRING:
                {
                    const falseValue = this.#valueStack.pop();
                    const trueValue = this.#valueStack.pop();
                    const testValue = this.#valueStack.pop();
                    this.#valueStack.push(testValue ? trueValue : falseValue);
                }
                break;
            default:
                throw new U.Unimplemented(StdFunc[stdfuncId]);
        }
        return RUNNING;
    }
}
export default Runner;
