//
// Compiler
//
import Logger, { LogLevel } from "logger";
const log = new Logger("compiler", LogLevel.ALL);

import * as C from "code";
import { Cmd, Program } from "command";
import { Result } from "utils";
import * as U from "utils";

export type CompileError = string;

class Compiler {
    readonly src: C.ParsedSource;

    #program: number[] = [];
    #litStrId: Map<string,number> = new Map();
    #litStr: string[] = [];
    

    constructor(src: C.ParsedSource) {
        this.src = src;
    }

    #getLitStrId(s: string): number {
        if (this.#litStrId.has(s)) {
            return this.#litStrId.get(s)!;
        }
        const id = this.#litStr.length;
        this.#litStr.push(s);
        this.#litStrId.set(s, id);
        return id;
    }

    compile(): Program {

        this.#pushBlock(this.src.blockInfo);
        this.#compileBlockBody(this.src.blockInfo);
        this.#popBlock(this.src.blockInfo);

        throw new U.Unimplemented();
    }

    #pushBlock(bi: C.BlockInfo): void {
        this.#program.push(Cmd.PUSH_BLOCK);
        this.#program.push(bi.id);
        this.#program.push(bi.varList.length);
    }

    #popBlock(bi: C.BlockInfo): void {
        this.#program.push(Cmd.POP_BLOCK);
        this.#program.push(bi.id);
    }

    #compileBlockBody(bi: C.BlockInfo): void {

        for (const code of bi.body) {
            switch (code.kind) {
                case C.CodeKind.DIM:
                    this.#compileDim(code as C.Dim);
                    break;
                case C.CodeKind.LET:
                    this.#compileLet(code as C.Let);
                    break;
                default:
                    throw new U.Unimplemented(code);
            }
        }

    }

    #compileDim(code: C.Dim): void {
        let cmd: Cmd;
        switch (code.nameInfo.vtype & C.Vtype.PRIMITIVE_TYPE) {
            case C.Vtype.BOOLEAN:
                switch (code.dims.length) {
                    case 1: cmd = Cmd.INIT_BARR1D; break;
                    case 2: cmd = Cmd.INIT_BARR2D; break;
                    case 3: cmd = Cmd.INIT_BARR3D; break;
                    default: U.unreachable(code);
                }
                break;
            case C.Vtype.FLOATING_POINT:
                switch (code.dims.length) {
                    case 1: cmd = Cmd.INIT_FARR1D; break;
                    case 2: cmd = Cmd.INIT_FARR2D; break;
                    case 3: cmd = Cmd.INIT_FARR3D; break;
                    default: U.unreachable(code);
                }
                break;
            case C.Vtype.INTEGER:
                switch (code.dims.length) {
                    case 1: cmd = Cmd.INIT_IARR1D; break;
                    case 2: cmd = Cmd.INIT_IARR2D; break;
                    case 3: cmd = Cmd.INIT_IARR3D; break;
                    default: U.unreachable(code);
                }
                break;
            case C.Vtype.STRING:
                switch (code.dims.length) {
                    case 1: cmd = Cmd.INIT_SARR1D; break;
                    case 2: cmd = Cmd.INIT_SARR2D; break;
                    case 3: cmd = Cmd.INIT_SARR3D; break;
                    default: U.unreachable(code);
                }
                break;
            default:
                U.unreachable(code);
        }
        this.#program.push(cmd);
        this.#program.push(code.nameInfo.blockId);
        this.#program.push(code.nameInfo.blockVarId);
        for (const size of code.dims) {
            this.#program.push(size);
        }
    }

    #compileLet(code: C.Let): void {
        this.#compileExpr(code.expr);
        let cmd: Cmd;
        switch (code.nameInfo.vtype) {
            case C.Vtype.BOOLEAN:        cmd = Cmd.SET_BVAR; break;
            case C.Vtype.FLOATING_POINT: cmd = Cmd.SET_FVAR; break;
            case C.Vtype.INTEGER:        cmd = Cmd.SET_IVAR; break;
            case C.Vtype.STRING:         cmd = Cmd.SET_SVAR; break;
            default: U.unreachable(code);
        }
        this.#program.push(cmd);
        this.#program.push(code.nameInfo.blockId);
        this.#program.push(code.nameInfo.blockVarId);
    }

    #compileExpr(expr: C.Expr): void {
        switch (expr.kind) {
            case C.ExprKind.LITERAL:
                this.#compileExprLiteral(expr);
                break;
            case C.ExprKind.BRACKET:
                this.#compileExpr((expr as C.ExprBracket).expr);
                break;
            case C.ExprKind.VARIABLE:
                this.#compileExprVar(expr as C.ExprVar);
                break;
            default:
                throw new U.Unimplemented(expr);
        }
    }

    #compileExprLiteral(expr: C.Expr): void {
        switch (expr.vtype) {
            case C.Vtype.BOOLEAN:
                if ((expr as C.ExprLitBoolean).value) {
                    this.#program.push(Cmd.BPUSH_TRUE);
                } else {
                    this.#program.push(Cmd.BPUSH_FALSE);
                }
                break;
            case C.Vtype.FLOATING_POINT:
                this.#program.push(Cmd.FPUSH);
                this.#program.push((expr as C.ExprLitFloat).value);
                break;
            case C.Vtype.INTEGER:
                this.#program.push(Cmd.IPUSH);
                this.#program.push((expr as C.ExprLitInt).value);
                break;
            case C.Vtype.STRING:
                this.#program.push(Cmd.SPUSH);
                const litStrId = this.#getLitStrId((expr as C.ExprLitString).value);
                this.#program.push(litStrId);
                break;
            default:
                U.unreachable(expr);
        }
    }

    #compileExprVar(expr: C.ExprVar): void {
        if (expr.vtype !== expr.nameInfo.vtype) {
            this.#compileExprArrayVarVal(expr as C.ExprArrayVarVal);
            return;
        }
        let cmd: Cmd;
        switch (expr.nameInfo.vtype) {
            case C.Vtype.BOOLEAN:        cmd = Cmd.GET_BVAR; break;
            case C.Vtype.FLOATING_POINT: cmd = Cmd.GET_FVAR; break;
            case C.Vtype.INTEGER:        cmd = Cmd.GET_IVAR; break;
            case C.Vtype.STRING:         cmd = Cmd.GET_SVAR; break;
            case C.Vtype.BOOL_ARRAY:     cmd = Cmd.APUSH_BARR1D; break;
            case C.Vtype.BOOL_ARRAY_2D:  cmd = Cmd.APUSH_BARR2D; break;
            case C.Vtype.BOOL_ARRAY_3D:  cmd = Cmd.APUSH_BARR3D; break;
            case C.Vtype.FLOAT_ARRAY:    cmd = Cmd.APUSH_FARR1D; break;
            case C.Vtype.FLOAT_ARRAY_2D: cmd = Cmd.APUSH_FARR2D; break;
            case C.Vtype.FLOAT_ARRAY_3D: cmd = Cmd.APUSH_FARR3D; break;
            case C.Vtype.INT_ARRAY:      cmd = Cmd.APUSH_IARR1D; break;
            case C.Vtype.INT_ARRAY_2D:   cmd = Cmd.APUSH_IARR2D; break;
            case C.Vtype.INT_ARRAY_3D:   cmd = Cmd.APUSH_IARR3D; break;
            case C.Vtype.STR_ARRAY:      cmd = Cmd.APUSH_SARR1D; break;
            case C.Vtype.STR_ARRAY_2D:   cmd = Cmd.APUSH_SARR2D; break;
            case C.Vtype.STR_ARRAY_3D:   cmd = Cmd.APUSH_SARR3D; break;
            default: U.unreachable(expr);
        }

        this.#program.push(cmd);
        this.#program.push(expr.nameInfo.blockId);
        this.#program.push(expr.nameInfo.blockVarId);
    }

    #compileExprArrayVarVal(expr: C.ExprArrayVarVal): void {
        for (const index of expr.indexes) {
            this.#compileExpr(index);
        }
        let cmd: Cmd;
        switch (expr.nameInfo.vtype) {
            case C.Vtype.BOOL_ARRAY:     cmd = Cmd.GET_BARR1D; break;
            case C.Vtype.BOOL_ARRAY_2D:  cmd = Cmd.GET_BARR2D; break;
            case C.Vtype.BOOL_ARRAY_3D:  cmd = Cmd.GET_BARR3D; break;
            case C.Vtype.FLOAT_ARRAY:    cmd = Cmd.GET_FARR1D; break;
            case C.Vtype.FLOAT_ARRAY_2D: cmd = Cmd.GET_FARR2D; break;
            case C.Vtype.FLOAT_ARRAY_3D: cmd = Cmd.GET_FARR3D; break;
            case C.Vtype.INT_ARRAY:      cmd = Cmd.GET_IARR1D; break;
            case C.Vtype.INT_ARRAY_2D:   cmd = Cmd.GET_IARR2D; break;
            case C.Vtype.INT_ARRAY_3D:   cmd = Cmd.GET_IARR3D; break;
            case C.Vtype.STR_ARRAY:      cmd = Cmd.GET_SARR1D; break;
            case C.Vtype.STR_ARRAY_2D:   cmd = Cmd.GET_SARR2D; break;
            case C.Vtype.STR_ARRAY_3D:   cmd = Cmd.GET_SARR3D; break;
            default: U.unreachable(expr);
        }
        this.#program.push(cmd);
        this.#program.push(expr.nameInfo.blockId);
        this.#program.push(expr.nameInfo.blockVarId);
    }
}


export function compile(src: C.ParsedSource): Program {
    const compiler = new Compiler(src);
    return compiler.compile();
}

export default {};
