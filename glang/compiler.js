//
// Compiler
//
import Logger, { LogLevel } from "logger";
const log = new Logger("compiler", LogLevel.ALL);
import * as C from "code";
import { Cmd } from "command";
import * as U from "utils";
class Compiler {
    src;
    #program = [];
    #litStrId = new Map();
    #litStr = [];
    #userFuncAddressMap = new Map();
    #userFuncAddressReferrers = [];
    #blockIdStack = [];
    constructor(src) {
        this.src = src;
    }
    #getNextAddress() {
        return this.#program.length;
    }
    #getLitStrId(s) {
        if (this.#litStrId.has(s)) {
            return this.#litStrId.get(s);
        }
        const id = this.#litStr.length;
        this.#litStr.push(s);
        this.#litStrId.set(s, id);
        return id;
    }
    #addCmd(cmd, ...params) {
        this.#program.push(cmd);
        if (params.length > 0) {
            this.#program.push(...params);
        }
    }
    #addParam(param) {
        const address = this.#getNextAddress();
        this.#program.push(param);
        return address;
    }
    #addParams(...params) {
        if (params.length > 0) {
            this.#program.push(...params);
        }
    }
    #setParam(address, param) {
        this.#program[address] = param;
    }
    #addCmdCallUserFunc(funcId) {
        this.#userFuncAddressReferrers.push(this.#getNextAddress());
        this.#program.push(funcId);
        const address = this.#addParam(0);
        const returnAddress = this.#getNextAddress();
        this.#setParam(address, returnAddress);
    }
    #pushBlock(bi) {
        this.#blockIdStack.push(bi.id);
        this.#addCmd(Cmd.PUSH_BLOCK, bi.id, bi.varList.length);
    }
    #popBlock(bi) {
        this.#blockIdStack.pop();
        this.#addCmd(Cmd.POP_BLOCK, bi.id);
    }
    /**
     * Return文のためのブロックスタックを解放ののちRETするコマンドを追加する.
     * 戻り値が含まれる値スタックはこのメソッドでは操作しない.
     * 戻り値がある場合はこのメソッドを呼び出す前に戻り値を値スタックに含める必要がある.
     * @param funcInfo
     */
    #addCmdReturn(funcInfo) {
        for (let i = this.#blockIdStack.length - 1; i >= 0; i--) {
            const bid = this.#blockIdStack[i];
            this.#addCmd(Cmd.POP_BLOCK, bid);
            if (bid === funcInfo.outerBlockId) {
                break;
            }
        }
        this.#addCmd(Cmd.RET);
    }
    compile() {
        const dimlet = [];
        const subfunc = [];
        const mainSubIdHolder = new U.Once();
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
    #compileCodeBlock(block) {
        for (const code of block) {
            switch (code.kind) {
                case C.CodeKind.DIM:
                    this.#compileDim(code);
                    break;
                case C.CodeKind.LET:
                    this.#compileLet(code);
                    break;
                default:
                    throw new U.Unimplemented(code);
            }
        }
    }
    #compileDefineUserFunc(code) {
        const funcInfo = code.funcInfo;
        const funcId = funcInfo.varId;
        const address = this.#getNextAddress();
        this.#userFuncAddressMap.set(funcId, address);
        const outerBlockInfo = code.blockInfo;
        this.#pushBlock(outerBlockInfo);
        const argNames = funcInfo.argNames;
        if (argNames !== undefined) {
            // 値スタックに積まれた引数を割り当て.
            for (let i = argNames.length - 1; i >= 0; i--) {
                const arg = argNames[i];
                let cmd;
                switch (arg.vtype) {
                    case C.Vtype.BOOLEAN:
                        cmd = Cmd.SET_BVAR;
                        break;
                    case C.Vtype.FLOATING_POINT:
                        cmd = Cmd.SET_FVAR;
                        break;
                    case C.Vtype.INTEGER:
                        cmd = Cmd.SET_IVAR;
                        break;
                    case C.Vtype.STRING:
                        cmd = Cmd.SET_SVAR;
                        break;
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
    #compileDim(code) {
        let cmd;
        switch (code.nameInfo.vtype & C.Vtype.PRIMITIVE_TYPE) {
            case C.Vtype.BOOLEAN:
                switch (code.dims.length) {
                    case 1:
                        cmd = Cmd.INIT_BARR1D;
                        break;
                    case 2:
                        cmd = Cmd.INIT_BARR2D;
                        break;
                    case 3:
                        cmd = Cmd.INIT_BARR3D;
                        break;
                    default: U.unreachable(code);
                }
                break;
            case C.Vtype.FLOATING_POINT:
                switch (code.dims.length) {
                    case 1:
                        cmd = Cmd.INIT_FARR1D;
                        break;
                    case 2:
                        cmd = Cmd.INIT_FARR2D;
                        break;
                    case 3:
                        cmd = Cmd.INIT_FARR3D;
                        break;
                    default: U.unreachable(code);
                }
                break;
            case C.Vtype.INTEGER:
                switch (code.dims.length) {
                    case 1:
                        cmd = Cmd.INIT_IARR1D;
                        break;
                    case 2:
                        cmd = Cmd.INIT_IARR2D;
                        break;
                    case 3:
                        cmd = Cmd.INIT_IARR3D;
                        break;
                    default: U.unreachable(code);
                }
                break;
            case C.Vtype.STRING:
                switch (code.dims.length) {
                    case 1:
                        cmd = Cmd.INIT_SARR1D;
                        break;
                    case 2:
                        cmd = Cmd.INIT_SARR2D;
                        break;
                    case 3:
                        cmd = Cmd.INIT_SARR3D;
                        break;
                    default: U.unreachable(code);
                }
                break;
            default:
                U.unreachable(code);
        }
        this.#addCmd(cmd, code.nameInfo.blockId, code.nameInfo.blockVarId);
        this.#addParams(...code.dims);
    }
    #compileLet(code) {
        this.#compileExpr(code.expr);
        let cmd;
        switch (code.nameInfo.vtype) {
            case C.Vtype.BOOLEAN:
                cmd = Cmd.SET_BVAR;
                break;
            case C.Vtype.FLOATING_POINT:
                cmd = Cmd.SET_FVAR;
                break;
            case C.Vtype.INTEGER:
                cmd = Cmd.SET_IVAR;
                break;
            case C.Vtype.STRING:
                cmd = Cmd.SET_SVAR;
                break;
            default: U.unreachable(code);
        }
        this.#addCmd(cmd, code.nameInfo.blockId, code.nameInfo.blockVarId);
    }
    #compileExpr(expr) {
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
    #compileExprLiteral(expr) {
        switch (expr.vtype) {
            case C.Vtype.BOOLEAN:
                U.assert(expr instanceof C.ExprLitBoolean, expr);
                if (expr.value) {
                    this.#addCmd(Cmd.BPUSH_TRUE);
                }
                else {
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
    #compileExprVar(expr) {
        if (expr.vtype !== expr.nameInfo.vtype) {
            this.#compileExprArrayVarVal(expr);
            return;
        }
        let cmd;
        switch (expr.nameInfo.vtype) {
            case C.Vtype.BOOLEAN:
                cmd = Cmd.GET_BVAR;
                break;
            case C.Vtype.FLOATING_POINT:
                cmd = Cmd.GET_FVAR;
                break;
            case C.Vtype.INTEGER:
                cmd = Cmd.GET_IVAR;
                break;
            case C.Vtype.STRING:
                cmd = Cmd.GET_SVAR;
                break;
            case C.Vtype.BOOL_ARRAY:
                cmd = Cmd.APUSH_BARR1D;
                break;
            case C.Vtype.BOOL_ARRAY_2D:
                cmd = Cmd.APUSH_BARR2D;
                break;
            case C.Vtype.BOOL_ARRAY_3D:
                cmd = Cmd.APUSH_BARR3D;
                break;
            case C.Vtype.FLOAT_ARRAY:
                cmd = Cmd.APUSH_FARR1D;
                break;
            case C.Vtype.FLOAT_ARRAY_2D:
                cmd = Cmd.APUSH_FARR2D;
                break;
            case C.Vtype.FLOAT_ARRAY_3D:
                cmd = Cmd.APUSH_FARR3D;
                break;
            case C.Vtype.INT_ARRAY:
                cmd = Cmd.APUSH_IARR1D;
                break;
            case C.Vtype.INT_ARRAY_2D:
                cmd = Cmd.APUSH_IARR2D;
                break;
            case C.Vtype.INT_ARRAY_3D:
                cmd = Cmd.APUSH_IARR3D;
                break;
            case C.Vtype.STR_ARRAY:
                cmd = Cmd.APUSH_SARR1D;
                break;
            case C.Vtype.STR_ARRAY_2D:
                cmd = Cmd.APUSH_SARR2D;
                break;
            case C.Vtype.STR_ARRAY_3D:
                cmd = Cmd.APUSH_SARR3D;
                break;
            default: U.unreachable(expr);
        }
        this.#addCmd(cmd, expr.nameInfo.blockId, expr.nameInfo.blockVarId);
    }
    #compileExprArrayVarVal(expr) {
        for (const index of expr.indexes) {
            this.#compileExpr(index);
        }
        let cmd;
        switch (expr.nameInfo.vtype) {
            case C.Vtype.BOOL_ARRAY:
                cmd = Cmd.GET_BARR1D;
                break;
            case C.Vtype.BOOL_ARRAY_2D:
                cmd = Cmd.GET_BARR2D;
                break;
            case C.Vtype.BOOL_ARRAY_3D:
                cmd = Cmd.GET_BARR3D;
                break;
            case C.Vtype.FLOAT_ARRAY:
                cmd = Cmd.GET_FARR1D;
                break;
            case C.Vtype.FLOAT_ARRAY_2D:
                cmd = Cmd.GET_FARR2D;
                break;
            case C.Vtype.FLOAT_ARRAY_3D:
                cmd = Cmd.GET_FARR3D;
                break;
            case C.Vtype.INT_ARRAY:
                cmd = Cmd.GET_IARR1D;
                break;
            case C.Vtype.INT_ARRAY_2D:
                cmd = Cmd.GET_IARR2D;
                break;
            case C.Vtype.INT_ARRAY_3D:
                cmd = Cmd.GET_IARR3D;
                break;
            case C.Vtype.STR_ARRAY:
                cmd = Cmd.GET_SARR1D;
                break;
            case C.Vtype.STR_ARRAY_2D:
                cmd = Cmd.GET_SARR2D;
                break;
            case C.Vtype.STR_ARRAY_3D:
                cmd = Cmd.GET_SARR3D;
                break;
            default: U.unreachable(expr);
        }
        this.#addCmd(cmd, expr.nameInfo.blockId, expr.nameInfo.blockVarId);
    }
    #compileExprUnaryOp(expr) {
        this.#compileExpr(expr.term);
        switch (expr.op.kind) {
            case C.UnaryOpKind.POSITIVE_SIGN:
                break;
            case C.UnaryOpKind.NEGATIVE_SIGN:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT:
                        this.#addCmd(Cmd.FNEGA);
                        break;
                    case C.Vtype.INTEGER:
                        this.#addCmd(Cmd.INEGA);
                        break;
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
    #compileExprBinOp(expr) {
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
        let cmd;
        switch (expr.op.kind) {
            case C.BinaryOpKind.ADD:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT:
                        cmd = Cmd.FADD;
                        break;
                    case C.Vtype.INTEGER:
                        cmd = Cmd.IADD;
                        break;
                    case C.Vtype.STRING:
                        cmd = Cmd.SCONCAT;
                        break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.SUBTRACT:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT:
                        cmd = Cmd.FSUB;
                        break;
                    case C.Vtype.INTEGER:
                        cmd = Cmd.ISUB;
                        break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.MULTIPLY:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT:
                        cmd = Cmd.FMUL;
                        break;
                    case C.Vtype.INTEGER:
                        cmd = Cmd.IMUL;
                        break;
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
                    case C.Vtype.BOOLEAN:
                        cmd = Cmd.BEQ;
                        break;
                    case C.Vtype.FLOATING_POINT:
                        cmd = Cmd.FEQ;
                        break;
                    case C.Vtype.INTEGER:
                        cmd = Cmd.IEQ;
                        break;
                    case C.Vtype.STRING:
                        cmd = Cmd.SEQ;
                        break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_NE:
                switch (expr.vtype) {
                    case C.Vtype.BOOLEAN:
                        cmd = Cmd.BNE;
                        break;
                    case C.Vtype.FLOATING_POINT:
                        cmd = Cmd.FNE;
                        break;
                    case C.Vtype.INTEGER:
                        cmd = Cmd.INE;
                        break;
                    case C.Vtype.STRING:
                        cmd = Cmd.SNE;
                        break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_LT:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT:
                        cmd = Cmd.FLT;
                        break;
                    case C.Vtype.INTEGER:
                        cmd = Cmd.ILT;
                        break;
                    case C.Vtype.STRING:
                        cmd = Cmd.SLT;
                        break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_LE:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT:
                        cmd = Cmd.FLE;
                        break;
                    case C.Vtype.INTEGER:
                        cmd = Cmd.ILE;
                        break;
                    case C.Vtype.STRING:
                        cmd = Cmd.SLE;
                        break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_GT:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT:
                        cmd = Cmd.FGT;
                        break;
                    case C.Vtype.INTEGER:
                        cmd = Cmd.IGT;
                        break;
                    case C.Vtype.STRING:
                        cmd = Cmd.SGT;
                        break;
                    default: U.unreachable(expr);
                }
                break;
            case C.BinaryOpKind.COMPARE_GE:
                switch (expr.vtype) {
                    case C.Vtype.FLOATING_POINT:
                        cmd = Cmd.FGE;
                        break;
                    case C.Vtype.INTEGER:
                        cmd = Cmd.IGE;
                        break;
                    case C.Vtype.STRING:
                        cmd = Cmd.SGE;
                        break;
                    default: U.unreachable(expr);
                }
                break;
            default: U.unreachable(expr);
        }
        this.#addCmd(cmd);
    }
    #compileExprBinOpShortcircuitAnd(expr) {
        this.#compileExpr(expr.termL);
        this.#addCmd(Cmd.DUP);
        this.#addCmd(Cmd.JUMP_IF_FALSE);
        const paramAddr = this.#addParam(0);
        this.#compileExpr(expr.termR);
        this.#addCmd(Cmd.BAND);
        const jumpToAddr = this.#getNextAddress();
        this.#setParam(paramAddr, jumpToAddr);
    }
    #compileExprBinOpShortcircuitOr(expr) {
        this.#compileExpr(expr.termL);
        this.#addCmd(Cmd.DUP);
        this.#addCmd(Cmd.JUMP_IF_TRUE);
        const paramAddr = this.#addParam(0);
        this.#compileExpr(expr.termR);
        this.#addCmd(Cmd.BOR);
        const jumpToAddr = this.#getNextAddress();
        this.#setParam(paramAddr, jumpToAddr);
    }
    #compileExprCallStdFunc(expr) {
        let args;
        let stdfuncId;
        if (expr instanceof C.ExprStdFunc) {
            U.assert(expr.stdfuncId !== undefined, expr);
            args = expr.args;
            stdfuncId = expr.stdfuncId;
        }
        else {
            U.assert(expr instanceof C.ExprMemberStdFunc, expr);
            U.assert(expr.stdfuncId !== undefined, expr);
            args = expr.args;
            stdfuncId = expr.stdfuncId;
        }
        for (const arg of args) {
            this.#compileExpr(arg);
        }
        this.#addCmd(Cmd.CALL_STDFUNC, stdfuncId);
    }
    #compileExprCallUserFunc(expr) {
        let args;
        let funcInfo;
        if (expr instanceof C.ExprUserFunc) {
            args = expr.args;
            funcInfo = expr.funcInfo;
        }
        else {
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
export function compile(src) {
    const compiler = new Compiler(src);
    return compiler.compile();
}
export default {};
