//
// Compiler
//
import Logger, { LogLevel } from "logger";
const log = new Logger("compiler", LogLevel.ALL);

import * as C from "code";
import { Cmd, Program, StdFunc } from "command";
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
        const address = this.#addParam(0);
        const returnAddress = this.#getNextAddress();
        this.#setParam(address, returnAddress);
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
                    U.assert(code instanceof C.DefineUserFunc);
                    subfunc.push(code);
                    if (code.funcInfo.isMain) {
                        mainSubIdHolder.set(code.funcInfo.varId);
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
                case C.CodeKind.ASSIGN_ARRAY:
                    U.assert(code instanceof C.AssignArray);
                    this.#compileAssignArray(code);
                    break;
                case C.CodeKind.ASSIGN_VAR:
                    U.assert(code instanceof C.AssignVar);
                    this.#compileAssignVar(code);
                    break;
                case C.CodeKind.DIM:
                    U.assert(code instanceof C.Dim);
                    this.#compileDim(code);
                    break;
                case C.CodeKind.LET:
                    U.assert(code instanceof C.Let);
                    this.#compileLet(code);
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
        const blockCode = outerBlockInfo.body[0];
        U.assert(blockCode.kind === C.CodeKind.BLOCK);
        U.assert(blockCode instanceof C.Block);
        const innerBlockInfo = blockCode.blockInfo;
        this.#pushBlock(innerBlockInfo);

        this.#compileCodeBlock(innerBlockInfo.body);

        // innnerBlockInfo.bodyがReturnで終わってる場合、以下のコードは実行されない.
        this.#popBlock(innerBlockInfo);
        this.#popBlock(outerBlockInfo);
        this.#addCmd(Cmd.RET);

    }

    #compileAssignOp(op: C.AssignOpInfo, vtype: C.Vtype) {
        let cmd: Cmd;
        switch (op.kind) {
            case C.AssignKind.ADD:
                switch (vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FADD; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.IADD; break;
                    case C.Vtype.STRING:         cmd = Cmd.SCONCAT; break;
                    default: U.unreachable(vtype);
                }
                break;
            case C.AssignKind.SUBTRACT:
                switch (vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FSUB; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.ISUB; break;
                    default: U.unreachable(vtype);
                }
                break;
            case C.AssignKind.MULTIPLY:
                switch (vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FMUL; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.IMUL; break;
                    default: U.unreachable(vtype);
                }
                break;
            case C.AssignKind.DIVIDE:
                U.assert(vtype === C.Vtype.FLOATING_POINT, vtype);
                cmd = Cmd.FDIV;
                break;
            case C.AssignKind.INT_DIVIDE:
                U.assert(vtype === C.Vtype.INTEGER, vtype);
                cmd = Cmd.IDIV;
                break;
            case C.AssignKind.INT_REMINDER:
                U.assert(vtype === C.Vtype.INTEGER, vtype);
                cmd = Cmd.IREM;
                break;
            case C.AssignKind.BITWISE_AND:
                U.assert(vtype === C.Vtype.INTEGER, vtype);
                cmd = Cmd.IAND;
                break;
            case C.AssignKind.BITWISE_OR:
                U.assert(vtype === C.Vtype.INTEGER, vtype);
                cmd = Cmd.IOR;
                break;
            case C.AssignKind.BITWISE_XOR:
                U.assert(vtype === C.Vtype.INTEGER, vtype);
                cmd = Cmd.IXOR;
                break;
            case C.AssignKind.BITWISE_ASHIFT_L:
                U.assert(vtype === C.Vtype.INTEGER, vtype);
                cmd = Cmd.IASHIFTL;
                break;
            case C.AssignKind.BITWISE_ASHIFT_R:
                U.assert(vtype === C.Vtype.INTEGER, vtype);
                cmd = Cmd.IASHIFTR;
                break;
            case C.AssignKind.BITWISE_LSHIFT_L:
                U.assert(vtype === C.Vtype.INTEGER, vtype);
                cmd = Cmd.ILSHIFTL;
                break;
            case C.AssignKind.BITWISE_LSHIFT_R:
                U.assert(vtype === C.Vtype.INTEGER, vtype);
                cmd = Cmd.ILSHIFTR;
                break;
            default: U.unreachable(op);
        }
        
        this.#addCmd(cmd);
    }

    #compileAssignVar(code: C.AssignVar): void {
        if (code.op.kind !== C.AssignKind.ASSIGN) {
            this.#compileGetVar(code.nameInfo);
        }
        
        this.#compileExpr(code.expr);

        if (code.op.kind !== C.AssignKind.ASSIGN) {
           this.#compileAssignOp(code.op, code.expr.vtype);
        }

        this.#compileSetVar(code.nameInfo);
    }

    #compileAssignArray(code: C.AssignArray): void {
        if (code.op.kind !== C.AssignKind.ASSIGN) {
            this.#compileGetArrayVarVal(code.nameInfo, code.indexes);
        }

        this.#compileExpr(code.expr);

        if (code.op.kind !== C.AssignKind.ASSIGN) {
            this.#compileAssignOp(code.op, code.expr.vtype);
        }

        this.#compileSetArrayVarVal(code.nameInfo, code.indexes);
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
        this.#addParams(...code.dims);
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
                U.assert(expr instanceof C.ExprVar);
                this.#compileExprVar(expr);
                break;
            case C.ExprKind.UNARY_OP:
                U.assert(expr instanceof C.ExprUnaryOp);
                this.#compileExprUnaryOp(expr);
                break;
            case C.ExprKind.BINARY_OP:
                U.assert(expr instanceof C.ExprBinOp);
                this.#compileExprBinOp(expr);
                break;
            case C.ExprKind.STD_FUNC:
                this.#compileExprCallStdFunc(expr);
                break;
            case C.ExprKind.USER_FUNC:
                this.#compileExprCallUserFunc(expr);
                break;
            case C.ExprKind.BRACKET:
                U.assert(expr instanceof C.ExprBracket);
                this.#compileExpr(expr.expr);
                break;
            default: U.unreachable(expr);
        }
    }

    #compileExprLiteral(expr: C.Expr): void {
        switch (expr.vtype) {
            case C.Vtype.BOOLEAN:
                U.assert(expr instanceof C.ExprLitBoolean, expr);
                if (expr.value) {
                    this.#addCmd(Cmd.BPUSH_TRUE);
                } else {
                    this.#addCmd(Cmd.BPUSH_FALSE);
                }
                break;
            case C.Vtype.FLOATING_POINT:
                U.assert(expr instanceof C.ExprLitFloat, expr);
                this.#addCmd(Cmd.FPUSH, expr.value);
                break;
            case C.Vtype.INTEGER:
                U.assert(expr instanceof C.ExprLitInt, expr);
                this.#addCmd(Cmd.IPUSH, expr.value);
                break;
            case C.Vtype.STRING:
                U.assert(expr instanceof C.ExprLitString, expr);
                const litStrId = this.#getLitStrId(expr.value);
                this.#addCmd(Cmd.SPUSH, litStrId);
                break;
            default:
                U.unreachable(expr);
        }
    }

    #compileGetVar(nameInfo: C.NameInfo): void {
        let cmd: Cmd;
        switch (nameInfo.vtype) {
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
            default: U.unreachable(nameInfo);
        }

        this.#addCmd(cmd, nameInfo.blockId, nameInfo.blockVarId);
    }

    #compileSetVar(nameInfo: C.NameInfo): void {
        let cmd: Cmd;
        switch (nameInfo.vtype) {
            case C.Vtype.BOOLEAN:        cmd = Cmd.SET_BVAR; break;
            case C.Vtype.FLOATING_POINT: cmd = Cmd.SET_FVAR; break;
            case C.Vtype.INTEGER:        cmd = Cmd.SET_IVAR; break;
            case C.Vtype.STRING:         cmd = Cmd.SET_SVAR; break;
            default: U.unreachable(nameInfo);
        }
        this.#addCmd(cmd, nameInfo.blockId, nameInfo.blockVarId);
    }


    #compileGetArrayVarVal(nameInfo: C.NameInfo, indexes: Readonly<C.Expr[]>): void {
        for (const index of indexes) {
            this.#compileExpr(index);
        }
        let cmd: Cmd;
        switch (nameInfo.vtype) {
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
            default: U.unreachable(nameInfo);
        }
        this.#addCmd(cmd, nameInfo.blockId, nameInfo.blockVarId);

    }

    #compileSetArrayVarVal(nameInfo: C.NameInfo, indexes: Readonly<C.Expr[]>): void {
        for (const index of indexes) {
            this.#compileExpr(index);
        }
        let cmd: Cmd;
        switch (nameInfo.vtype) {
            case C.Vtype.BOOL_ARRAY:     cmd = Cmd.SET_BARR1D; break;
            case C.Vtype.BOOL_ARRAY_2D:  cmd = Cmd.SET_BARR2D; break;
            case C.Vtype.BOOL_ARRAY_3D:  cmd = Cmd.SET_BARR3D; break;
            case C.Vtype.FLOAT_ARRAY:    cmd = Cmd.SET_FARR1D; break;
            case C.Vtype.FLOAT_ARRAY_2D: cmd = Cmd.SET_FARR2D; break;
            case C.Vtype.FLOAT_ARRAY_3D: cmd = Cmd.SET_FARR3D; break;
            case C.Vtype.INT_ARRAY:      cmd = Cmd.SET_IARR1D; break;
            case C.Vtype.INT_ARRAY_2D:   cmd = Cmd.SET_IARR2D; break;
            case C.Vtype.INT_ARRAY_3D:   cmd = Cmd.SET_IARR3D; break;
            case C.Vtype.STR_ARRAY:      cmd = Cmd.SET_SARR1D; break;
            case C.Vtype.STR_ARRAY_2D:   cmd = Cmd.SET_SARR2D; break;
            case C.Vtype.STR_ARRAY_3D:   cmd = Cmd.SET_SARR3D; break;
            default: U.unreachable(nameInfo);
        }
        this.#addCmd(cmd, nameInfo.blockId, nameInfo.blockVarId);

    }

    #compileExprVar(expr: C.ExprVar): void {
        if (expr.vtype !== expr.nameInfo.vtype) {
            U.assert(expr instanceof C.ExprArrayVarVal);
            this.#compileGetArrayVarVal(expr.nameInfo, expr.indexes);
            return;
        }
        this.#compileGetVar(expr.nameInfo);
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
                cmd = Cmd.IREM;
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
                switch (expr.termL.vtype) {
                    case C.Vtype.BOOLEAN:        cmd = Cmd.BEQ; break;
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FEQ; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.IEQ; break;
                    case C.Vtype.STRING:         cmd = Cmd.SEQ; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_NE:
                switch (expr.termL.vtype) {
                    case C.Vtype.BOOLEAN:        cmd = Cmd.BNE; break;
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FNE; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.INE; break;
                    case C.Vtype.STRING:         cmd = Cmd.SNE; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_LT:
                switch (expr.termL.vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FLT; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.ILT; break;
                    case C.Vtype.STRING:         cmd = Cmd.SLT; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_LE:
                switch (expr.termL.vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FLE; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.ILE; break;
                    case C.Vtype.STRING:         cmd = Cmd.SLE; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_GT:
                switch (expr.termL.vtype) {
                    case C.Vtype.FLOATING_POINT: cmd = Cmd.FGT; break;
                    case C.Vtype.INTEGER:        cmd = Cmd.IGT; break;
                    case C.Vtype.STRING:         cmd = Cmd.SGT; break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_GE:
                switch (expr.termL.vtype) {
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

    #compileExprCallStdFunc(expr: C.Expr): void {
        let args: Readonly<C.Expr[]>;
        let stdfuncId: StdFunc;
        if (expr instanceof C.ExprStdFunc) {
            U.assert(expr.stdfuncId !== undefined, expr);
            args = expr.args;
            stdfuncId = expr.stdfuncId;
        } else {
            U.assert(expr instanceof C.ExprMemberStdFunc, expr);
            U.assert(expr.stdfuncId !== undefined, expr);
            args = expr.args;
            stdfuncId = expr.stdfuncId;
        }
        for (const arg of args) {
            this.#compileExpr(arg);
        }
        this.#addCmd(Cmd.CALL_STDFUNC, stdfuncId as number);
    }

    #compileExprCallUserFunc(expr: C.Expr): void {
        let args: Readonly<C.Expr[]>;
        let funcInfo: C.FuncInfo;
        if (expr instanceof C.ExprUserFunc) {
            args = expr.args;
            funcInfo = expr.funcInfo;
        } else {
            U.assert(expr instanceof C.ExprMemberUserFunc, expr);
            args = expr.args;
            funcInfo = expr.funcInfo;
        }
        for (const arg of args) {
            this.#compileExpr(arg);
        }
        this.#addCmdCallUserFunc(funcInfo.varId);
    }
}


export function compile(src: C.ParsedSource): Program {
    const compiler = new Compiler(src);
    return compiler.compile();
}

export default {};
