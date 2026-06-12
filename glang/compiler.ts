//
// Compiler
//
import Logger, { LogLevel } from "logger";
const log = new Logger("compiler", LogLevel.ERROR | LogLevel.WARN);

import * as C from "code";
import { Cmd, Program, StdFunc } from "command";
import * as U from "utils";

export type CompileError = string;

class Compiler {
    readonly src: C.ParsedSource;

    #program: number[] = [];
    #litStrIdMap: Map<string,number> = new Map();        // 文字列リテラル => 文字列リテラルプールID.
    #litStrPool: string[] = [];                          // 文字列リテラルプール.
    #userFuncAddressMap: Map<number,number> = new Map(); // ユーザ関数ID(ブロック変数ID) => call呼び出し先アドレス.
    #userFuncAddressReferrers: number[] = [];            // callオペランド位置アドレス. 仮初期値: #program[address] = ユーザ関数ID.
    #continueAddressMap: Map<number,number> = new Map(); // ループブロックID => 継続処理部先頭アドレス.
    #continueAddressReferrers: number[] = [];            // jumpオペランド位置アドレス. 仮初期値: #program[address] = ループブロックID.
    #breakAddressMap: Map<number,number> = new Map();    // ループブロックID => ループ終了処理先頭アドレス.
    #breakAddressReferres: number[] = [];                // jumpオペランド位置アドレス. 仮初期値: #program[address] = ループブロックID.
    #blockIdStack: number[] = [];                        // pushBlockするたびにブロックIDをスタック構造で管理.

    constructor(src: C.ParsedSource) {
        this.src = src;
    }

    #getNextAddress(): number {
        return this.#program.length;
    }

    #getLitStrId(s: string): number {
        if (this.#litStrIdMap.has(s)) {
            return this.#litStrIdMap.get(s)!;
        }
        const id = this.#litStrPool.length;
        this.#litStrPool.push(s);
        this.#litStrIdMap.set(s, id);
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

    #addCmdCallStdFunc(stdfuncId: StdFunc): void {
        this.#addCmd(Cmd.CALL_STDFUNC, stdfuncId as number);
    }

    #addCmdCallUserFunc(funcId: number): void {
        this.#addCmd(Cmd.CALL_USERFUNC);
        const userfuncAddressReferrer = this.#addParam(funcId);
        this.#userFuncAddressReferrers.push(userfuncAddressReferrer);
        const returnAddressReferrer = this.#addParam(0);
        const returnAddress = this.#getNextAddress();
        this.#setParam(returnAddressReferrer, returnAddress);
    }

    #addCmdGetVarVal(nameInfo: C.NameInfo): void {

        let cmd: Cmd;
        switch (nameInfo.vtype) {
            case C.Vtype.BOOLEAN:        cmd = Cmd.GET_BVAR; break;
            case C.Vtype.FLOATING_POINT: cmd = Cmd.GET_FVAR; break;
            case C.Vtype.INTEGER:        cmd = Cmd.GET_IVAR; break;
            case C.Vtype.STRING:         cmd = Cmd.GET_SVAR; break;
            default: U.unreachable(nameInfo);
        }

        this.#addCmd(cmd, nameInfo.blockId, nameInfo.blockVarId);
    }

    #addCmdSetVarVal(nameInfo: C.NameInfo): void {

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

    #pushBlock(bi: C.BlockInfo): void {
        this.#blockIdStack.push(bi.id);
        this.#addCmd(Cmd.PUSH_BLOCK, bi.id, bi.varList.length);
    }

    #popBlock(bi: C.BlockInfo): void {
        this.#blockIdStack.pop();
        this.#addCmd(Cmd.POP_BLOCK, bi.id);
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

        for (const referrer of this.#continueAddressReferrers) {
            const blockId = this.#program[referrer];
            const adderss = this.#continueAddressMap.get(blockId);
            U.assert(adderss !== undefined);
            this.#program[referrer] = adderss;            
        }

        for (const referrer of this.#breakAddressReferres) {
            const blockId = this.#program[referrer];
            const address = this.#breakAddressMap.get(blockId);
            U.assert(address !== undefined);
            this.#program[referrer] = address;
        }

        for (const referrer of this.#userFuncAddressReferrers) {
            const funcId = this.#program[referrer];
            const address = this.#userFuncAddressMap.get(funcId);
            U.assert(address !== undefined);
            this.#program[referrer] = address;
        }

        return new Program(this.#program, this.#litStrPool, this.src.totalBlockCount);
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
                case C.CodeKind.BREAK:
                    U.assert(code instanceof C.Break);
                    this.#compileBreak(code);
                    break;
                case C.CodeKind.CALL_STD_FUNC:
                    U.assert(code instanceof C.CallStdFunc);
                    this.#compileCallStdFunc(code);
                    break;
                case C.CodeKind.CALL_USER_FUNC:
                    U.assert(code instanceof C.CallUserFunc);
                    this.#compileCallUserFunc(code);
                    break;
                case C.CodeKind.CONTINUE:
                    U.assert(code instanceof C.Continue);
                    this.#compileContinue(code);
                    break;
                case C.CodeKind.DIM:
                    U.assert(code instanceof C.Dim);
                    this.#compileDim(code);
                    break;
                case C.CodeKind.DO_WHILE:
                    U.assert(code instanceof C.DoWhile);
                    this.#compileDoWhile(code);
                    break;
                case C.CodeKind.FOR:
                    U.assert(code instanceof C.For);
                    this.#compileFor(code);
                    break;
                case C.CodeKind.IF:
                    U.assert(code instanceof C.If);
                    this.#compileIf(code);
                    break;
                case C.CodeKind.LET:
                    U.assert(code instanceof C.Let);
                    this.#compileLet(code);
                    break;
                case C.CodeKind.PRINT:
                    U.assert(code instanceof C.Print);
                    this.#compilePrint(code);
                    break;
                case C.CodeKind.RETURN:
                    U.assert(code instanceof C.Return);
                    this.#compileReturn(code);
                    break;
                default:
                    U.unreachable(code);
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

        let cmd: Cmd;
        switch (code.nameInfo.vtype) {
            case C.Vtype.BOOLEAN:        cmd = Cmd.SET_BVAR; break;
            case C.Vtype.FLOATING_POINT: cmd = Cmd.SET_FVAR; break;
            case C.Vtype.INTEGER:        cmd = Cmd.SET_IVAR; break;
            case C.Vtype.STRING:         cmd = Cmd.SET_SVAR; break;
            default: U.unreachable(code.nameInfo);
        }
        this.#addCmd(cmd, code.nameInfo.blockId, code.nameInfo.blockVarId);
    }

    #compileAssignArray(code: C.AssignArray): void {
        for (const index of code.indexes) {
            this.#compileExpr(index);
        }

        if (code.op.kind !== C.AssignKind.ASSIGN) {
            this.#addCmd(Cmd.DUPN, code.indexes.length);
            this.#compileGetArrayVarVal(code.nameInfo, []);
        }

        this.#compileExpr(code.expr);

        if (code.op.kind !== C.AssignKind.ASSIGN) {
            this.#compileAssignOp(code.op, code.expr.vtype);
        }

        let cmd: Cmd;
        switch (code.nameInfo.vtype) {
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
            default: U.unreachable(code);
        }

        this.#addCmd(cmd, code.nameInfo.blockId, code.nameInfo.blockVarId);
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

    #compileFor(code: C.For): void {
        // ループカウンタなどループ処理判定に使う値を保存する領域がouterBlock.
        const outerBlockInfo = code.blockInfo;
        this.#pushBlock(outerBlockInfo);

        // ループカウンタ初期値の計算と保存.
        this.#compileExpr(code.initValue.expr);
        this.#addCmd(Cmd.DUP);
        this.#addCmdSetVarVal(code.initValue.nameInfo); // TODO 初期値を別途保存する意味がないので削除検討.

        // ループカウンタ終了値の計算と保存.
        this.#compileExpr(code.endValue.expr);
        this.#addCmdSetVarVal(code.endValue.nameInfo);

        // ループカウンタ増減値の計算と保存.
        if (code.stepValue.expr !== null) {
            this.#compileExpr(code.stepValue.expr);
        } else {
            this.#addCmd(Cmd.IPUSH, 1);
        }
        this.#addCmdSetVarVal(code.stepValue.nameInfo);

        // Cmd.DUPした初期値をループカウンタに保存.
        // 当初ループカウンタをfor外で定義できる前提で考えてたため終了値や増減値の計算に影響させないための後置保存だったわけだが.
        // ループカウンタをforで定義に固定した今、この位置で処理する必要は特にない(初期値計算直後で処理してもよい).
        this.#addCmdSetVarVal(code.loopCounter);

        // ループ終了条件の判定処理.
        const condAddress = this.#getNextAddress();

        // ループカウンタ増減値の正負(-1,0,1)を求める.
        this.#addCmdGetVarVal(code.stepValue.nameInfo);
        this.#addCmdCallStdFunc(StdFunc.SIGN_INTEGER);

        // ループカウンタと終了値の差分の正負(-1,0,1)を求めて増減値の正負と比較し終了判定をする.
        // 増加の場合: 増減値 > 0 && ループカウンタ > 終了値 は SIGN(ループカウンタ - 終了値) = SIGN(増減値) = 1 となる.
        // 減少の場合: 増減値 < 0 && ループカウンタ < 終了値 は SIGN(ループカウンタ - 終了値) = SIGN(増減値) = -1 となる.
        this.#addCmdGetVarVal(code.loopCounter);
        this.#addCmdGetVarVal(code.endValue.nameInfo);
        this.#addCmd(Cmd.ISUB);
        this.#addCmdCallStdFunc(StdFunc.SIGN_INTEGER);
        this.#addCmd(Cmd.IEQ);
        this.#addCmd(Cmd.JUMP_IF_TRUE);
        const blockEndRefferer = this.#addParam(outerBlockInfo.id);
        this.#breakAddressReferres.push(blockEndRefferer);

        // outerBlockが内包するinnerBlockがfor文に実行させるコード群を保持している.

        U.assert(outerBlockInfo.body.length === 1);
        const blockCode = outerBlockInfo.body[0];
        U.assert(blockCode.kind === C.CodeKind.BLOCK);
        U.assert(blockCode instanceof C.Block);
        const innerBlockInfo = blockCode.blockInfo;

        this.#pushBlock(innerBlockInfo);
        this.#compileCodeBlock(innerBlockInfo.body);
        this.#popBlock(innerBlockInfo);

        // ループ継続処理開始位置.
        const continueAddress = this.#getNextAddress();
        this.#continueAddressMap.set(outerBlockInfo.id, continueAddress);

        // ループカウンタを増減させる処理.
        this.#addCmdGetVarVal(code.loopCounter);
        this.#addCmdGetVarVal(code.stepValue.nameInfo);
        this.#addCmd(Cmd.IADD);
        this.#addCmdSetVarVal(code.loopCounter);
        // ループ終了判定条件処理でジャンプ.
        this.#addCmd(Cmd.JUMP, condAddress);

        // ループブロック終了処理開始位置.
        const breakAddress = this.#getNextAddress();
        this.#breakAddressMap.set(outerBlockInfo.id, breakAddress);

        // ループブロック解放処理のみ.
        this.#popBlock(outerBlockInfo);
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

 
    #compileContinue(code: C.Continue): void {
        // ループブロック直前までのブロックスタックを解放しループブロック継続判定処理へジャンプする.
        for (let i = this.#blockIdStack.length-1; i >= 0; i--) {
            const bid = this.#blockIdStack[i];
            if (bid === code.blockId) {
                break;
            }
            this.#addCmd(Cmd.POP_BLOCK, bid);
        }
        this.#addCmd(Cmd.JUMP);
        const referrer = this.#addParam(code.blockId);
        this.#continueAddressReferrers.push(referrer);
    }

    #compileBreak(code: C.Break): void {
        // ループブロック直前までのブロックスタックを解放しループブロック終了処理へジャンプする.
        for (let i = this.#blockIdStack.length-1; i >= 0; i--) {
            const bid = this.#blockIdStack[i];
            if (bid === code.blockId) {
                break;
            }
            this.#addCmd(Cmd.POP_BLOCK, bid);
        }
        this.#addCmd(Cmd.JUMP);
        const referrer = this.#addParam(code.blockId);
        this.#breakAddressReferres.push(referrer);
    }

    #compileIf(code: C.If): void {
        const blockEndReferrers: number[] = [];
        let nextTestAddressReferrer: number | undefined = undefined;
        for (let i = 0; i < code.blockInfoList.length; i++) {
            if (nextTestAddressReferrer !== undefined) {
                const condAddress = this.#getNextAddress();
                this.#setParam(nextTestAddressReferrer, condAddress);
            }
            if (i < code.testExprList.length) {
                this.#compileExpr(code.testExprList[i]);
                this.#addCmd(Cmd.JUMP_IF_FALSE);
                nextTestAddressReferrer = this.#addParam(0);
            } else {
                nextTestAddressReferrer = undefined;
            }
            const blockInfo = code.blockInfoList[i];
            this.#pushBlock(blockInfo);
            this.#compileCodeBlock(blockInfo.body);
            this.#popBlock(blockInfo);
            this.#addCmd(Cmd.JUMP);
            const blockEndReferrer = this.#addParam(0);
            blockEndReferrers.push(blockEndReferrer);
        }
        const blockEndAddress = this.#getNextAddress();
        if (nextTestAddressReferrer !== undefined) {
            this.#setParam(nextTestAddressReferrer, blockEndAddress);
        }
        for (const referrer of blockEndReferrers) {
            this.#setParam(referrer, blockEndAddress);
        }
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

    #compileExprVar(expr: C.ExprVar): void {
        if (expr.vtype !== expr.nameInfo.vtype) {
            U.assert(expr instanceof C.ExprArrayVarVal, expr);
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

    #compileCallStdFunc(code: C.CallStdFunc): void {
        for (const arg of code.args) {
            this.#compileExpr(arg);
        }
        U.assert(code.stdfuncId !== undefined);
        this.#addCmdCallStdFunc(code.stdfuncId);
        if (code.funcInfo.isFunc) {
            this.#addCmd(Cmd.POP);
        }
    }

    #compileCallUserFunc(code: C.CallUserFunc): void {
        for (const arg of code.args) {
            this.#compileExpr(arg);
        }
        this.#addCmdCallStdFunc(code.funcInfo.varId);
        if (code.funcInfo.isFunc) {
            this.#addCmd(Cmd.POP);
        }
    }

    #compileReturn(code: C.Return): void {
        // 戻り値の計算.
        if (code.value !== null) {
            this.#compileExpr(code.value);
        }
        // Return文のためのブロックスタックを解放ののちRETするコマンドを追加する.
        for (let i = this.#blockIdStack.length-1; i >= 0; i--) {
            const bid = this.#blockIdStack[i];
            this.#addCmd(Cmd.POP_BLOCK, bid);
            if (bid === code.funcInfo.outerBlockId) {
                break;
            }
        }
        this.#addCmd(Cmd.RET);
    }

    #compileDoWhile(code: C.DoWhile): void {

        const outerBlockInfo = code.blockInfo;

        this.#pushBlock(outerBlockInfo);

        const continueAddress = this.#getNextAddress();
        this.#continueAddressMap.set(outerBlockInfo.id, continueAddress);

        this.#compileExpr(code.testExpr);
        this.#addCmd(Cmd.JUMP_IF_FALSE);
        const blockEndReferrer = this.#addParam(0);

        U.assert(outerBlockInfo.body.length === 1);
        const blockCode = outerBlockInfo.body[0];
        U.assert(blockCode.kind === C.CodeKind.BLOCK);
        U.assert(blockCode instanceof C.Block);
        const innerBlockInfo = blockCode.blockInfo;

        this.#pushBlock(innerBlockInfo);
        this.#compileCodeBlock(innerBlockInfo.body);
        this.#popBlock(innerBlockInfo);

        const blockEndAddress = this.#getNextAddress();
        this.#breakAddressMap.set(outerBlockInfo.id, blockEndAddress);
        this.#setParam(blockEndReferrer, blockEndAddress);

        this.#popBlock(outerBlockInfo);
    }

    #compilePrint(code: C.Print): void {
        for (const arg of code.args) {
            this.#compileExpr(arg);
        }
        this.#addCmd(Cmd.PRINT, code.args.length);
    }
}

export function compile(src: C.ParsedSource): Program {
    const compiler = new Compiler(src);
    return compiler.compile();
}

export default {};
