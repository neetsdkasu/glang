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
    #userFuncAddressMap: Map<number,number> = new Map();
    #userFuncAddressReferrers: number[] = [];
    #blockIdStack: number[] = [];
 
    constructor(src: C.ParsedSource) {
        this.src = src;
    }

    #getNextAddress(): number {
        return this.#program.length;
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

    #addCmd(cmd: Cmd, ...params: number[]): void {
        this.#program.push(cmd as number);
        if (params.length > 0) {
            this.#program.push(...params);
        }
    }

    #addParam(param: number): number {
        const address = this.#getNextAddress();
        this.#program.push(param);
        return address;
    }

    #addParams(...params: number[]): void {
        if (params.length > 0) {
            this.#program.push(...params);
        }
    }

    #setParam(address: number, param: number): void {
        this.#program[address] = param;
    }

    #addCmdCallUserFunc(funcId: number): void {
        this.#userFuncAddressReferrers.push(this.#getNextAddress());
        this.#program.push(funcId);
    }

    #pushBlock(bi: C.BlockInfo): void {
        this.#blockIdStack.push(bi.id);
        this.#addCmd(Cmd.PUSH_BLOCK, bi.id, bi.varList.length);
    }

    #popBlock(bi: C.BlockInfo): void {
        this.#blockIdStack.pop();
        this.#addCmd(Cmd.POP_BLOCK, bi.id);
    }
    
    /**
     * Return文のためのブロックスタックを解放ののちRETするコマンドを追加する.
     * 戻り値が含まれる値スタックはこのメソッドでは操作しない.
     * 戻り値がある場合はこのメソッドを呼び出す前に戻り値を値スタックに含める必要がある.
     * @param funcInfo 
     */
    #addCmdReturn(funcInfo: C.FuncInfo): void {
        for (let i = this.#blockIdStack.length-1; i >= 0; i--) {
            const bid = this.#blockIdStack[i];
            this.#addCmd(Cmd.POP_BLOCK, bid);
            if (bid === funcInfo.outerBlockId) {
                break;
            }
        }
        this.#addCmd(Cmd.RET);
    }

    compile(): Program {

        const dimlet: C.Code[] = [];
        const subfunc: C.DefineUserFunc[] = [];
        const mainSubIdHolder: U.Once<number> = new U.Once();

        for (const code of this.src.blockInfo.body) {
            switch (code.kind) {
                case C.CodeKind.DIM:
                case C.CodeKind.LET:
                    dimlet.push(code);
                    break;
                case C.CodeKind.DEFINE_USER_FUNC:
                    const dufCode = code as C.DefineUserFunc;
                    subfunc.push(dufCode);
                    if (dufCode.funcInfo.isMain) {
                        mainSubIdHolder.set(dufCode.funcInfo.varId);
                    }
                    break;
                default:
                    U.unreachable(code);
            }
        }

        const mainSubId = mainSubIdHolder.get();

        this.#pushBlock(this.src.blockInfo);

        this.#compileCodeBlock(dimlet);

        this.#addCmdCallUserFunc(mainSubId);

        this.#popBlock(this.src.blockInfo);

        this.#addCmd(Cmd.END);

        for (const code of subfunc) {
            this.#compileDefineUserFunc(code);
        }


        throw new U.Unimplemented();
    }


    #compileCodeBlock(block: Readonly<C.Code[]>): void {

        for (const code of block) {
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

    #compileDefineUserFunc(code: C.DefineUserFunc): void {
        const funcInfo = code.funcInfo;
        const funcId = funcInfo.varId;
        const address = this.#getNextAddress();
        this.#userFuncAddressMap.set(funcId, address);

        const outerBlockInfo = code.blockInfo;
        this.#pushBlock(outerBlockInfo);

        const argNames = funcInfo.argNames;

        if (argNames !== undefined) {
            // 値スタックに積まれた引数を割り当て.
            for (let i = argNames.length-1; i >= 0; i--) {
                const arg = argNames[i];
                let cmd: Cmd;
                switch (arg.vtype) {
                    case C.Vtype.BOOLEAN:        cmd = Cmd.SET_BVAR; break;
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.SET_FVAR; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.SET_IVAR; break;
                    case C.Vtype.STRING:         cmd = Cmd.SET_SVAR; break;
                    default: U.unreachable();
                }
                this.#addCmd(cmd, arg.blockId, arg.blockVarId);
            }
        }

        U.assert(outerBlockInfo.body.length === 1);
        U.assert(outerBlockInfo.body[0].kind === C.CodeKind.BLOCK);
        const innerBlockInfo = (outerBlockInfo.body[0] as C.Block).blockInfo;
        this.#pushBlock(innerBlockInfo);

        this.#compileCodeBlock(innerBlockInfo.body);

        // innnerBlockInfo.bodyがReturnで終わってる場合、以下のコードは実行されない.
        this.#popBlock(innerBlockInfo);
        this.#popBlock(outerBlockInfo);
        this.#addCmd(Cmd.RET);

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
        this.#addCmd(cmd, code.nameInfo.blockId, code.nameInfo.blockVarId);
        for (const size of code.dims) {
            this.#addParam(size);
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
        this.#addCmd(cmd, code.nameInfo.blockId, code.nameInfo.blockVarId);
    }

    #compileExpr(expr: C.Expr): void {
        switch (expr.kind) {
            case C.ExprKind.LITERAL:
                this.#compileExprLiteral(expr);
                break;
            case C.ExprKind.VARIABLE:
                this.#compileExprVar(expr as C.ExprVar);
                break;
            case C.ExprKind.UNARY_OP:
                this.#compileExprUnaryOp(expr as C.ExprUnaryOp);
                break;
            case C.ExprKind.BINARY_OP:
                this.#compileExprBinOp(expr as C.ExprBinOp);
                break;
            case C.ExprKind.STD_FUNC:
            case C.ExprKind.USER_FUNC:
                throw new U.Unimplemented(expr);
            case C.ExprKind.BRACKET:
                this.#compileExpr((expr as C.ExprBracket).expr);
                break;
            default: U.unreachable(expr);
        }
    }

    #compileExprLiteral(expr: C.Expr): void {
        switch (expr.vtype) {
            case C.Vtype.BOOLEAN:
                if ((expr as C.ExprLitBoolean).value) {
                    this.#addCmd(Cmd.BPUSH_TRUE);
                } else {
                    this.#addCmd(Cmd.BPUSH_FALSE);
                }
                break;
            case C.Vtype.FLOATING_POINT:
                this.#addCmd(Cmd.FPUSH, (expr as C.ExprLitFloat).value);
                break;
            case C.Vtype.INTEGER:
                this.#addCmd(Cmd.IPUSH, (expr as C.ExprLitInt).value);
                break;
            case C.Vtype.STRING:
                const litStrId = this.#getLitStrId((expr as C.ExprLitString).value);
                this.#addCmd(Cmd.SPUSH, litStrId);
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

        this.#addCmd(cmd, expr.nameInfo.blockId, expr.nameInfo.blockVarId);
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
        this.#addCmd(cmd, expr.nameInfo.blockId, expr.nameInfo.blockVarId);
    }

    #compileExprUnaryOp(expr: C.ExprUnaryOp): void {
        this.#compileExpr(expr.term);
        switch (expr.op.kind) {
            case C.UnaryOpKind.POSITIVE_SIGN:
                break;
            case C.UnaryOpKind.NEGATIVE_SIGN:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT: this.#addCmd(Cmd.FNEGA); break;
                    case C.Vtype.INTEGER:        this.#addCmd(Cmd.INEGA); break;
                    default: U.unreachable(expr);
                }
                break;
            case C.UnaryOpKind.BITWISE_NOT:
                this.#addCmd(Cmd.INOT);
                break;
            case C.UnaryOpKind.LOGICAL_NOT:
                this.#addCmd(Cmd.BNOT);
                break;
        }
    }

    #compileExprBinOp(expr: C.ExprBinOp): void {
        switch (expr.op.kind) {
            case C.BinaryOpKind.SHORTCIRCUIT_AND:
                this.#compileExprBinOpShortcircuitAnd(expr);
                return;
            case C.BinaryOpKind.SHORTCIRGUIT_OR:
                this.#compileExprBinOpShortcircuitOr(expr);
                return;
            default:
                break;
        }
        this.#compileExpr(expr.termL);
        this.#compileExpr(expr.termR);
        
        let cmd: Cmd;
        switch (expr.op.kind) {
            case C.BinaryOpKind.ADD:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FADD; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.IADD; break;
                    case C.Vtype.STRING:         cmd = Cmd.SCONCAT; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.SUBTRACT:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FSUB; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.ISUB; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.MULTIPLY:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FMUL; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.IMUL; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.DIVIDE:
                U.assert(expr.vtype === C.Vtype.FLOATING_POINT, expr);
                cmd = Cmd.FDIV;
                break;
            case C.BinaryOpKind.INT_DIVIDE:
                U.assert(expr.vtype === C.Vtype.INTEGER, expr);
                cmd = Cmd.IDIV;
                break;
            case C.BinaryOpKind.INT_REMINDER:
                U.assert(expr.vtype === C.Vtype.INTEGER, expr);
                cmd = Cmd.IMOD;
                break;
            case C.BinaryOpKind.BITWISE_AND:
                U.assert(expr.vtype === C.Vtype.INTEGER, expr);
                cmd = Cmd.IAND;
                break;
            case C.BinaryOpKind.BITWISE_OR:
                U.assert(expr.vtype === C.Vtype.INTEGER, expr);
                cmd = Cmd.IOR;
                break;
            case C.BinaryOpKind.BITWISE_XOR:
                U.assert(expr.vtype === C.Vtype.INTEGER, expr);
                cmd = Cmd.IXOR;
                break;
            case C.BinaryOpKind.BITWISE_ASHIFT_L:
                U.assert(expr.vtype === C.Vtype.INTEGER, expr);
                cmd = Cmd.IASHIFTL;
                break;
            case C.BinaryOpKind.BITWISE_ASHIFT_R:
                U.assert(expr.vtype === C.Vtype.INTEGER, expr);
                cmd = Cmd.IASHIFTR;
                break;
            case C.BinaryOpKind.BITWISE_LSHIFT_L:
                U.assert(expr.vtype === C.Vtype.INTEGER, expr);
                cmd = Cmd.ILSHIFTL;
                break;
            case C.BinaryOpKind.BITWISE_LSHIFT_R:
                U.assert(expr.vtype === C.Vtype.INTEGER, expr);
                cmd = Cmd.ILSHIFTR;
                break;
            case C.BinaryOpKind.COMPARE_EQ:
                switch (expr.vtype) {
                    case C.Vtype.BOOLEAN:        cmd = Cmd.BEQ; break;
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FEQ; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.IEQ; break;
                    case C.Vtype.STRING:         cmd = Cmd.SEQ; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_NE:
                switch (expr.vtype) {
                    case C.Vtype.BOOLEAN:        cmd = Cmd.BNE; break;
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FNE; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.INE; break;
                    case C.Vtype.STRING:         cmd = Cmd.SNE; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_LT:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FLT; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.ILT; break;
                    case C.Vtype.STRING:         cmd = Cmd.SLT; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_LE:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FLE; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.ILE; break;
                    case C.Vtype.STRING:         cmd = Cmd.SLE; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_GT:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FGT; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.IGT; break;
                    case C.Vtype.STRING:         cmd = Cmd.SGT; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_GE:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FGE; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.IGE; break;
                    case C.Vtype.STRING:         cmd = Cmd.SGE; break;
                    default: U.unreachable(expr);
                }
                break;
            default: U.unreachable(expr);
        }

        this.#addCmd(cmd);
    }

    #compileExprBinOpShortcircuitAnd(expr: C.ExprBinOp): void {
        this.#compileExpr(expr.termL);
        this.#addCmd(Cmd.DUP);
        this.#addCmd(Cmd.JUMP_IF_FALSE);
        const paramAddr = this.#addParam(0);
        this.#compileExpr(expr.termR);
        this.#addCmd(Cmd.BAND);
        const jumpToAddr = this.#getNextAddress();
        this.#setParam(paramAddr, jumpToAddr);
    }

    #compileExprBinOpShortcircuitOr(expr: C.ExprBinOp): void {
        this.#compileExpr(expr.termL);
        this.#addCmd(Cmd.DUP);
        this.#addCmd(Cmd.JUMP_IF_TRUE);
        const paramAddr = this.#addParam(0);
        this.#compileExpr(expr.termR);
        this.#addCmd(Cmd.BOR);
        const jumpToAddr = this.#getNextAddress();
        this.#setParam(paramAddr, jumpToAddr);
    }
}


export function compile(src: C.ParsedSource): Program {
    const compiler = new Compiler(src);
    return compiler.compile();
}

export default {};
