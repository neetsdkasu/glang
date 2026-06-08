//
// Code
// 
import Logger, { LogLevel } from "logger";
const log = new Logger("code", LogLevel.ERROR | LogLevel.WARN);
import { Token } from "scanner";
import { Result } from "utils";
import * as U from "utils";
export class ParsedSource {
    blockInfo;
    constructor(blockInfo) {
        this.blockInfo = blockInfo;
    }
    toString() {
        return `ParsedSource{ blockInfo: ${this.blockInfo} }`;
    }
}
export var Vtype;
(function (Vtype) {
    Vtype[Vtype["NONE"] = 0] = "NONE";
    Vtype[Vtype["VOID"] = 1] = "VOID";
    Vtype[Vtype["BOOLEAN"] = 2] = "BOOLEAN";
    Vtype[Vtype["FLOATING_POINT"] = 4] = "FLOATING_POINT";
    Vtype[Vtype["INTEGER"] = 8] = "INTEGER";
    Vtype[Vtype["STRING"] = 16] = "STRING";
    Vtype[Vtype["ARRAY_TYPE"] = 32] = "ARRAY_TYPE";
    Vtype[Vtype["ARRAY_SIZE_1"] = 64] = "ARRAY_SIZE_1";
    Vtype[Vtype["ARRAY_1D"] = 96] = "ARRAY_1D";
    Vtype[Vtype["ARRAY_2D"] = 160] = "ARRAY_2D";
    Vtype[Vtype["ARRAY_3D"] = 224] = "ARRAY_3D";
    Vtype[Vtype["ARRAY_SIZE"] = 192] = "ARRAY_SIZE";
    Vtype[Vtype["SUB"] = 256] = "SUB";
    Vtype[Vtype["FUNC"] = 512] = "FUNC";
    Vtype[Vtype["REFERENCE_VAR"] = 1024] = "REFERENCE_VAR";
    Vtype[Vtype["INFER"] = 2048] = "INFER";
    Vtype[Vtype["PRIMITIVE_TYPE"] = 30] = "PRIMITIVE_TYPE";
    Vtype[Vtype["NUMBER_TYPE"] = 12] = "NUMBER_TYPE";
    Vtype[Vtype["LOGICAL_TYPE"] = 10] = "LOGICAL_TYPE";
    Vtype[Vtype["COMPARE_TYPE"] = 28] = "COMPARE_TYPE";
    Vtype[Vtype["CONCAT_TYPE"] = 28] = "CONCAT_TYPE";
    Vtype[Vtype["NON_PRIMITIVE"] = 1824] = "NON_PRIMITIVE";
    Vtype[Vtype["BOOL_ARRAY"] = 98] = "BOOL_ARRAY";
    Vtype[Vtype["BOOL_ARRAY_2D"] = 162] = "BOOL_ARRAY_2D";
    Vtype[Vtype["BOOL_ARRAY_3D"] = 226] = "BOOL_ARRAY_3D";
    Vtype[Vtype["FLOAT_ARRAY"] = 100] = "FLOAT_ARRAY";
    Vtype[Vtype["FLOAT_ARRAY_2D"] = 164] = "FLOAT_ARRAY_2D";
    Vtype[Vtype["FLOAT_ARRAY_3D"] = 228] = "FLOAT_ARRAY_3D";
    Vtype[Vtype["INT_ARRAY"] = 104] = "INT_ARRAY";
    Vtype[Vtype["INT_ARRAY_2D"] = 168] = "INT_ARRAY_2D";
    Vtype[Vtype["INT_ARRAY_3D"] = 232] = "INT_ARRAY_3D";
    Vtype[Vtype["STR_ARRAY"] = 112] = "STR_ARRAY";
    Vtype[Vtype["STR_ARRAY_2D"] = 176] = "STR_ARRAY_2D";
    Vtype[Vtype["STR_ARRAY_3D"] = 240] = "STR_ARRAY_3D";
    Vtype[Vtype["INFER_PRIMITIVE"] = 2078] = "INFER_PRIMITIVE";
    Vtype[Vtype["INFER_NUMBER"] = 2060] = "INFER_NUMBER";
    Vtype[Vtype["INFER_LOGICAL"] = 2058] = "INFER_LOGICAL";
    Vtype[Vtype["INFER_COMPARE"] = 2076] = "INFER_COMPARE";
    Vtype[Vtype["INFER_CONCAT"] = 2076] = "INFER_CONCAT";
    Vtype[Vtype["INFER_ARRAY"] = 2080] = "INFER_ARRAY";
    Vtype[Vtype["INFER_REFERENCE"] = 3072] = "INFER_REFERENCE";
    Vtype[Vtype["INFER_CALLABLE"] = 2816] = "INFER_CALLABLE";
    Vtype[Vtype["INFER_ALL"] = 3902] = "INFER_ALL";
    Vtype[Vtype["UNKNOWN"] = 3903] = "UNKNOWN";
})(Vtype || (Vtype = {}));
export function arrayDimension(vtype) {
    const size = Math.floor((vtype & (Vtype.ARRAY_SIZE)) / (Vtype.ARRAY_SIZE_1));
    if (1 <= size && size <= 3) {
        return size;
    }
    else {
        log.dump("vtype", vtype);
        log.dump("Vtype[vtype]", Vtype[vtype]);
        throw new Error("BUG");
    }
}
/**
 * 引数のいずれかにINFERが含まれる場合は引数間で整合性のとれるVtypeを返す.
 * 整合性のとれる型が1つに限定される場合はその型を表すVtypeを返し、2つ以上の可能性があるならそれらを組み合わせた上でINFERをつけて返す.
 * 引数にいずれにもINFERが含まれていない場合はすべての引数が完全一致する場合においてのみその型のVtypeを返す.
 * 上記以外の場合はエラー値を返す.
 * INFERは標準関数か演算子か不明ユーザ関数に存在する.式や項の型として伝搬する.
 * @param t1
 * @param t2
 * @param t3
 */
export function inferVtype(t1, t2, t3) {
    if (t3 === undefined) {
        if (t1 === t2) {
            return Result.ok(t1);
        }
        if (((t1 | t2) & Vtype.INFER) !== Vtype.INFER) {
            // どちらもINFERを含まない場合は完全一致のみの判定でおわり.
            return Result.err("型の整合性がとれません.");
        }
        if (t1 === Vtype.UNKNOWN) {
            return Result.ok(t2);
        }
        if (t2 === Vtype.UNKNOWN) {
            return Result.ok(t1);
        }
        if ((t1 & t2) & Vtype.INFER) {
            // どちらもINFERを含む場合は、どうしよう.
            let infPrim = (t1 & t2) & Vtype.PRIMITIVE_TYPE;
            const infPrimCnt = U.popCount(infPrim);
            let infNonp = (t1 & t2) & Vtype.NON_PRIMITIVE;
            if (infPrimCnt === 0) {
                if (infNonp === Vtype.SUB || infNonp === Vtype.FUNC) {
                    return Result.ok(infNonp);
                }
                else if (infNonp) {
                    return Result.ok(infNonp | Vtype.INFER);
                }
                else {
                    return Result.err("型の整合性がとれません.");
                }
            }
            if (infPrimCnt > 1) {
                infPrim |= Vtype.INFER;
            }
            const infNonpCnt = U.popCount(infNonp);
            if (infNonpCnt === 0) {
                // NonPrimitive指定がない、つまりPrimitiveの型.
                return Result.ok(infPrim);
            }
            else {
                return Result.ok(infPrim | infNonp | Vtype.INFER);
            }
        }
        // t1かt2のどちらかにのみINFERがある、他方は確定の型.INFER側が確定の型に決定できるか判定する.
        if (t1 & Vtype.INFER) {
            if (t1 === Vtype.INFER_ARRAY) {
                if (t2 & Vtype.ARRAY_TYPE) {
                    return Result.ok(t2);
                }
            }
            else if (t1 === Vtype.INFER_REFERENCE) {
                if (t2 & Vtype.REFERENCE_VAR) {
                    return Result.ok(t2);
                }
            }
            else if ((t1 & t2) === (t2 & Vtype.INFER_ALL)) {
                return Result.ok(t2);
            }
        }
        else if (t2 & Vtype.INFER) {
            if (t2 === Vtype.INFER_ARRAY) {
                if (t1 & Vtype.ARRAY_TYPE) {
                    return Result.ok(t1);
                }
            }
            else if (t2 === Vtype.INFER_REFERENCE) {
                if (t1 & Vtype.REFERENCE_VAR) {
                    return Result.ok(t1);
                }
            }
            else if ((t1 & t2) === (t1 & Vtype.INFER_ALL)) {
                return Result.ok(t1);
            }
        }
        return Result.err("型の整合性がとれません.");
    }
    const res = inferVtype(t1, t2);
    if (res.isErr) {
        return res;
    }
    else {
        return inferVtype(res.result, t3);
    }
}
/**
 * 変数名およびユーザ関数名の簡易情報を管理する.
 */
export class NameInfo {
    src;
    name;
    varId;
    blockId;
    blockVarId;
    isLoopCounter;
    #vtype;
    #count = 0;
    #written = 0;
    #lastWritten = 0;
    #unused = [];
    #typedSrc;
    constructor(src, name, vtype, varId, blockId, blockVarId, isLoopCounter) {
        this.src = src;
        this.name = name;
        this.#vtype = vtype;
        this.varId = varId;
        this.blockId = blockId;
        this.blockVarId = blockVarId;
        this.isLoopCounter = isLoopCounter === true;
        U.assert(!isLoopCounter || vtype === Vtype.INTEGER);
        this.#typedSrc = (vtype & Vtype.INFER) !== Vtype.INFER ? src : undefined;
    }
    suck(garbage) {
        this.#count = garbage.#count;
        this.#written = garbage.#written;
        this.#lastWritten = garbage.#lastWritten;
        this.#unused = [...garbage.#unused];
    }
    /**
     * 変数の読み込み回数.
     */
    get count() {
        return this.#count;
    }
    /**
     * 変数の書き込み回数.
     */
    get written() {
        return this.#written;
    }
    get vtype() {
        return this.#vtype;
    }
    /**
     * 変数への最後の書き込み後から読み込みがあったかどうか.
     */
    get isUnused() {
        return this.#count <= this.#lastWritten;
    }
    /**
     * 変数への書き込み後に読み込みがなかったその書き込みタイミングのリスト.
     */
    get unused() {
        if (this.isUnused) {
            const unused = [this.#written];
            unused.push(...this.#unused);
            return unused;
        }
        else {
            return this.#unused;
        }
    }
    get typedSrc() {
        return this.#typedSrc;
    }
    /**
     * 変数の型にINFERが含まれている場合で型を特定できるときに呼び出す.
     * @param vtype 特定した型.
     */
    updateType(vtype, typedSrc) {
        const res = inferVtype(vtype, this.#vtype);
        if (res.isErr) {
            log.dump("vtype", vtype);
            log.dump("nameInfo:", this);
            log.error(res.error);
            throw new Error("BUG");
        }
        this.#vtype = res.result;
        this.#typedSrc = typedSrc;
    }
    /**
     * 変数の読み込み回数をインクリメント.
     */
    incrementCounter() {
        this.#count++;
    }
    /**
     * 変数の書き込み回数をインクリメント.
     */
    markWritten() {
        if (this.isUnused) {
            this.#unused.push(this.#written);
        }
        this.#written++;
        this.#lastWritten = this.#count;
    }
    /**
     * 指定のVtypeを含んでいるかを判定.
     * @param vtype
     * @returns 含んでいるときtrue.そうでないときfalse.
     */
    hasType(vtype) {
        return (this.vtype & vtype) === vtype;
    }
    /**
     * 複数のVtypeのいずれかを含んでいるかを判定.
     * @param vtype
     * @returns 含んでいるときtrue.そうでないときfalse.
     */
    hasAnyType(vtype) {
        return (this.vtype & vtype) !== 0;
    }
    toString() {
        return `NameInfo{ src: "${Token.lineToString(this.src)}", name: ${this.name}, vtype: ${Vtype[this.vtype]}, varId: ${this.varId}, blockId: ${this.blockId}, blockVarId: ${this.blockVarId}, count: ${this.#count}, written: ${this.written}, unused: ${this.unused.length}, loopCounter: ${this.isLoopCounter} }`;
    }
}
export class RetArg {
    ret;
    args;
    constructor(ret, args) {
        this.ret = ret;
        this.args = args;
    }
    /**
     * ユーザ定義関数(func/sub)の整合性チェック
     * 関数呼び出し側(this側)の戻り値の型や引数の数と型を定義(def側)どおりか確認する
     * 呼び出し側は標準関数との関係であいまいさ(INFER)で型が未決定を含む場合がある
     *
     * @param def: 関数定義のほう
     * @returns ok(false):完全一致(INFERなし). ok(true):一致(INFERが整合). err():不一致で整合性が取れない
     */
    checkConsistencyWith(def) {
        let hasInfer = false;
        if (this.ret & Vtype.INFER) {
            hasInfer = true;
            if (inferVtype(this.ret, def.ret).isErr) {
                return Result.err(`戻り値の型が不一致 (this: ${Vtype[this.ret]}, def: ${Vtype[def.ret]})`);
            }
        }
        else if (this.ret !== def.ret) {
            return Result.err(`戻り値の型が不一致 (this: ${Vtype[this.ret]}, def: ${Vtype[def.ret]})`);
        }
        if (this.args.length !== def.args.length) {
            return Result.err(`引数の数が不一致 (this: ${this.args.length}, def: ${def.args.length})`);
        }
        for (let i = 0; i < this.args.length; i++) {
            const ta = this.args[i];
            const da = def.args[i];
            if (ta & Vtype.INFER) {
                hasInfer = true;
                if (inferVtype(ta, da).isErr) {
                    return Result.err(`${i + 1}番目の引数の型が不一致 (this: ${Vtype[ta]}, def: ${Vtype[da]})`);
                }
            }
            else if (ta !== da) {
                return Result.err(`${i + 1}番目の引数の型が不一致 (this: ${Vtype[ta]}, def: ${Vtype[da]})`);
            }
        }
        return Result.ok(hasInfer);
    }
    get hasNoArg() {
        return this.args.length === 0;
    }
    /**
     * INFER属性が付いてるものは全部共通の型になることを前提に型検査&型決定を行う.
     * @param ret
     * @param args
     * @returns
     */
    inferTypes(ret, ...args) {
        U.assert(args.length === this.args.length);
        const retRes = inferVtype(this.ret, ret);
        if (retRes.isErr) {
            return Result.err(`戻り値の型が一致しません. [ ${retRes.error} ]`);
        }
        ret = retRes.result;
        let vtype = (this.ret & Vtype.INFER) ? ret : undefined;
        for (let i = 0; i < args.length; i++) {
            const argRes = inferVtype(args[i], this.args[i]);
            if (argRes.isErr) {
                return Result.err(`${i + 1}番目の引数の型が一致しません. [ ${argRes.error} ]`);
            }
            args[i] = argRes.result;
            if (this.args[i] & Vtype.INFER) {
                if (vtype !== undefined) {
                    const res = inferVtype(vtype, args[i]);
                    if (res.isErr) {
                        return Result.err(`${i + 1}番目の引数の型が一致しません. [ ${res.error} ]`);
                    }
                    vtype = res.result;
                }
                else {
                    vtype = args[i];
                }
            }
        }
        if (vtype !== undefined) {
            if (this.ret & Vtype.INFER) {
                ret = vtype;
            }
            for (let i = 0; i < args.length; i++) {
                if (this.args[i] & Vtype.INFER) {
                    args[i] = vtype;
                }
            }
        }
        return Result.ok({ ret: ret, args: args });
    }
    toString() {
        return `RetArg{ ret: ${Vtype[this.ret]}, args: [[ ${this.args.map(t => Vtype[t])} ]] }`;
    }
}
export var SideEffect;
(function (SideEffect) {
    SideEffect[SideEffect["NONE"] = 0] = "NONE";
    SideEffect[SideEffect["WRITE_GLOBAL_VAR"] = 1] = "WRITE_GLOBAL_VAR";
    SideEffect[SideEffect["ACCESS_IO"] = 2] = "ACCESS_IO";
    SideEffect[SideEffect["ALL"] = 3] = "ALL";
})(SideEffect || (SideEffect = {}));
export class StdFuncInfo {
    name;
    retArg;
    sideEffect;
    constructor(name, retArg, sideEffect) {
        this.name = name;
        this.retArg = retArg;
        this.sideEffect = sideEffect;
    }
    get isFunc() {
        return this.retArg.ret !== Vtype.VOID;
    }
    get isSub() {
        return this.retArg.ret === Vtype.VOID;
    }
    toString() {
        return `StdFuncInfo{ name: ${this.name}, retArg: ${this.retArg}, sideEffect: ${SideEffect[this.sideEffect]} }`;
    }
}
export class FuncInfo {
    src;
    name;
    retArg;
    varId;
    definition;
    argNames;
    outerBlockId;
    innerBlockId;
    isMain;
    #sideEffect = SideEffect.NONE;
    #dependencies;
    #isRecursive = false;
    constructor(src, name, retArg, varId, definition, isMain) {
        this.src = src;
        this.name = name;
        this.retArg = retArg;
        this.varId = varId;
        if (definition === undefined) {
            this.definition = false;
            this.argNames = undefined;
            this.outerBlockId = undefined;
            this.innerBlockId = undefined;
            this.#dependencies = null;
        }
        else {
            this.definition = true;
            this.argNames = definition.argNames;
            this.outerBlockId = definition.outerBlockId;
            this.innerBlockId = definition.innerBlockId;
            this.#dependencies = new Set();
        }
        this.isMain = isMain;
    }
    get sideEffect() {
        return this.#sideEffect;
    }
    get isRecursive() {
        return this.#isRecursive;
    }
    getDependencies() {
        U.assert(this.definition);
        U.assert(this.#dependencies !== null);
        return this.#dependencies;
    }
    addSideEffect(sideEffect) {
        this.#sideEffect |= sideEffect;
    }
    /**
     * 内部ブロックから呼び出すユーザ関数名を記録し依存関係を明確にする.
     * 実在するユーザ関数名かのチェックはしないのでこのメソッドを呼び出す側の責任.
     * @param userFuncName
     */
    addDependency(userFuncName) {
        U.assert(this.definition);
        U.assert(this.#dependencies !== null);
        this.#dependencies.add(userFuncName);
        if (userFuncName === this.name) {
            this.#isRecursive = true;
        }
    }
    validate(other) {
        if (this.varId !== other.varId || this.name !== other.name) {
            log.error("this", this);
            log.error("other", other);
            throw new Error("BUG: unmatch varId or name");
        }
        if (this.definition === other.definition) {
            log.error("this", this);
            log.error("other", other);
            throw new Error("BUG: require this.definition !== other.definition");
        }
        const def = this.definition ? this : other; // 定義側
        const cal = this.definition ? other : this; // 呼び出し側
        return cal.retArg.checkConsistencyWith(def.retArg);
    }
    toString() {
        return `FuncInfo{ src: ${Token.lineToString(this.src)}, name: ${this.name}, retArg: ${this.retArg}, varId: ${this.varId}, definition: ${this.definition}, sideEffect: ${SideEffect[this.#sideEffect]}, argNames: [${this.argNames}], outerBlockId: ${this.outerBlockId}, innerBlockId: ${this.innerBlockId}, isMain: ${this.isMain} }`;
    }
}
export var BinaryOpKind;
(function (BinaryOpKind) {
    BinaryOpKind[BinaryOpKind["ADD"] = 0] = "ADD";
    BinaryOpKind[BinaryOpKind["SUBTRACT"] = 1] = "SUBTRACT";
    BinaryOpKind[BinaryOpKind["MULTIPLY"] = 2] = "MULTIPLY";
    BinaryOpKind[BinaryOpKind["DIVIDE"] = 3] = "DIVIDE";
    BinaryOpKind[BinaryOpKind["INT_DIVIDE"] = 4] = "INT_DIVIDE";
    BinaryOpKind[BinaryOpKind["INT_REMINDER"] = 5] = "INT_REMINDER";
    BinaryOpKind[BinaryOpKind["BITWISE_AND"] = 6] = "BITWISE_AND";
    BinaryOpKind[BinaryOpKind["BITWISE_OR"] = 7] = "BITWISE_OR";
    BinaryOpKind[BinaryOpKind["BITWISE_XOR"] = 8] = "BITWISE_XOR";
    BinaryOpKind[BinaryOpKind["BITWISE_ASHIFT_L"] = 9] = "BITWISE_ASHIFT_L";
    BinaryOpKind[BinaryOpKind["BITWISE_ASHIFT_R"] = 10] = "BITWISE_ASHIFT_R";
    BinaryOpKind[BinaryOpKind["BITWISE_LSHIFT_L"] = 11] = "BITWISE_LSHIFT_L";
    BinaryOpKind[BinaryOpKind["BITWISE_LSHIFT_R"] = 12] = "BITWISE_LSHIFT_R";
    BinaryOpKind[BinaryOpKind["SHORTCIRCUIT_AND"] = 13] = "SHORTCIRCUIT_AND";
    BinaryOpKind[BinaryOpKind["SHORTCIRGUIT_OR"] = 14] = "SHORTCIRGUIT_OR";
    BinaryOpKind[BinaryOpKind["COMPARE_EQ"] = 15] = "COMPARE_EQ";
    BinaryOpKind[BinaryOpKind["COMPARE_NE"] = 16] = "COMPARE_NE";
    BinaryOpKind[BinaryOpKind["COMPARE_LT"] = 17] = "COMPARE_LT";
    BinaryOpKind[BinaryOpKind["COMPARE_LE"] = 18] = "COMPARE_LE";
    BinaryOpKind[BinaryOpKind["COMPARE_GT"] = 19] = "COMPARE_GT";
    BinaryOpKind[BinaryOpKind["COMPARE_GE"] = 20] = "COMPARE_GE"; // ">="
})(BinaryOpKind || (BinaryOpKind = {}));
export class BinaryOpInfo {
    kind;
    op;
    priority;
    retArg;
    constructor(kind, op, priority, retArg) {
        this.kind = kind;
        this.op = op;
        this.priority = priority;
        this.retArg = retArg;
    }
    toString() {
        return `BinOpInfo{ kind: ${BinaryOpKind[this.kind]}, op: ${this.op}, priority: ${this.priority}, retArg: ${this.retArg} }`;
    }
}
export var UnaryOpKind;
(function (UnaryOpKind) {
    UnaryOpKind[UnaryOpKind["POSITIVE_SIGN"] = 0] = "POSITIVE_SIGN";
    UnaryOpKind[UnaryOpKind["NEGATIVE_SIGN"] = 1] = "NEGATIVE_SIGN";
    UnaryOpKind[UnaryOpKind["BITWISE_NOT"] = 2] = "BITWISE_NOT";
    UnaryOpKind[UnaryOpKind["LOGICAL_NOT"] = 3] = "LOGICAL_NOT"; // "!"
})(UnaryOpKind || (UnaryOpKind = {}));
export class UnaryOpInfo {
    kind;
    op;
    vtype;
    constructor(kind, op, vtype) {
        this.kind = kind;
        this.op = op;
        this.vtype = vtype;
    }
    toString() {
        return `UnaryOpInfo{ kind: ${UnaryOpKind[this.kind]}, op: ${this.op}, vtype: ${Vtype[this.vtype]} }`;
    }
}
export var AssignKind;
(function (AssignKind) {
    AssignKind[AssignKind["ASSIGN"] = 0] = "ASSIGN";
    AssignKind[AssignKind["ADD"] = 1] = "ADD";
    AssignKind[AssignKind["SUBTRACT"] = 2] = "SUBTRACT";
    AssignKind[AssignKind["MULTIPLY"] = 3] = "MULTIPLY";
    AssignKind[AssignKind["DIVIDE"] = 4] = "DIVIDE";
    AssignKind[AssignKind["INT_DIVIDE"] = 5] = "INT_DIVIDE";
    AssignKind[AssignKind["INT_REMINDER"] = 6] = "INT_REMINDER";
    AssignKind[AssignKind["BITWISE_AND"] = 7] = "BITWISE_AND";
    AssignKind[AssignKind["BITWISE_OR"] = 8] = "BITWISE_OR";
    AssignKind[AssignKind["BITWISE_XOR"] = 9] = "BITWISE_XOR";
    AssignKind[AssignKind["BITWISE_ASHIFT_L"] = 10] = "BITWISE_ASHIFT_L";
    AssignKind[AssignKind["BITWISE_ASHIFT_R"] = 11] = "BITWISE_ASHIFT_R";
    AssignKind[AssignKind["BITWISE_LSHIFT_L"] = 12] = "BITWISE_LSHIFT_L";
    AssignKind[AssignKind["BITWISE_LSHIFT_R"] = 13] = "BITWISE_LSHIFT_R";
})(AssignKind || (AssignKind = {}));
export class AssignOpInfo {
    kind;
    op;
    vtype;
    constructor(kind, op, vtype) {
        this.kind = kind;
        this.op = op;
        this.vtype = vtype;
    }
    toString() {
        return `AssignOpInfo{ kind: ${AssignKind[this.kind]}, op: "${this.op}", vtype: ${Vtype[this.vtype]} }`;
    }
}
export var ExprKind;
(function (ExprKind) {
    ExprKind[ExprKind["LITERAL"] = 0] = "LITERAL";
    ExprKind[ExprKind["VARIABLE"] = 1] = "VARIABLE";
    ExprKind[ExprKind["UNARY_OP"] = 2] = "UNARY_OP";
    ExprKind[ExprKind["BINARY_OP"] = 3] = "BINARY_OP";
    ExprKind[ExprKind["STD_FUNC"] = 4] = "STD_FUNC";
    ExprKind[ExprKind["USER_FUNC"] = 5] = "USER_FUNC";
    ExprKind[ExprKind["BRACKET"] = 6] = "BRACKET";
})(ExprKind || (ExprKind = {}));
export class Expr {
    kind;
    vtype;
    src;
    constructor(kind, vtype, src) {
        this.kind = kind;
        this.vtype = vtype;
        this.src = src;
    }
}
export class ExprLitInt extends Expr {
    value;
    unaryOp; // valueに適用済みの単項演算子.
    constructor(src, value, unaryOp) {
        super(ExprKind.LITERAL, Vtype.INTEGER, src);
        this.value = value;
        this.unaryOp = unaryOp;
    }
    rebuild(findUserFunc) {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });
    }
    toString() {
        if (this.unaryOp) {
            return `LitInt{ value: ${this.value}, unaryOp: ${this.unaryOp} }`;
        }
        else {
            return `LitInt{ value: ${this.value} }`;
        }
    }
}
export class ExprLitFloat extends Expr {
    value;
    unaryOp; // valueに適用済みの単項演算子.
    constructor(src, value, unaryOp) {
        super(ExprKind.LITERAL, Vtype.FLOATING_POINT, src);
        this.value = value;
        this.unaryOp = unaryOp;
    }
    rebuild(findUserFunc) {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });
    }
    toString() {
        if (this.unaryOp) {
            return `LitFloat{ value: ${this.value}, unaryOp: ${this.unaryOp} }`;
        }
        else {
            return `LitFloat{ value: ${this.value} }`;
        }
    }
}
export class ExprLitBoolean extends Expr {
    value;
    unaryOp; // valueに適用済みの単項演算子.
    constructor(src, value, unaryOp) {
        super(ExprKind.LITERAL, Vtype.FLOATING_POINT, src);
        this.value = value;
        this.unaryOp = unaryOp;
    }
    rebuild(findUserFunc) {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });
    }
    toString() {
        if (this.unaryOp) {
            return `LitBoolean{ value: ${this.value}, unaryOp: ${this.unaryOp} }`;
        }
        else {
            return `LitBoolean{ value: ${this.value} }`;
        }
    }
}
export class ExprLitString extends Expr {
    value;
    constructor(src, value) {
        super(ExprKind.LITERAL, Vtype.STRING, src);
        this.value = value;
    }
    rebuild(findUserFunc) {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });
    }
    toString() {
        return `LitString{ value: "${this.value.replaceAll('"', '""')}" }`;
    }
}
export class ExprUnaryOp extends Expr {
    op;
    term;
    constructor(src, vtype, op, term) {
        super(ExprKind.UNARY_OP, vtype, src);
        this.op = op;
        this.term = term;
    }
    rebuild(findUserFunc) {
        const res = this.term.rebuild(findUserFunc);
        if (res.isErr) {
            return res;
        }
        const newTerm = res.result.expr;
        const vtypeRes = inferVtype(this.op.vtype, newTerm.vtype);
        if (vtypeRes.isErr) {
            return Result.err({ msg: vtypeRes.error, src: this.src });
        }
        const newExpr = new ExprUnaryOp(this.src, vtypeRes.result, this.op, newTerm);
        return Result.ok({ expr: newExpr, sideEffect: res.result.sideEffect });
    }
    toString() {
        return `UnaryOp{ op: ${this.op}, vtype: ${Vtype[this.vtype]}, term: [[ ${this.term} ]] }`;
    }
}
export class ExprBinOp extends Expr {
    op;
    termL;
    termR;
    constructor(src, vtype, op, termL, termR) {
        super(ExprKind.BINARY_OP, vtype, src);
        this.op = op;
        this.termL = termL;
        this.termR = termR;
    }
    rebuild(findUserFunc) {
        const resL = this.termL.rebuild(findUserFunc);
        if (resL.isErr) {
            return resL;
        }
        const newTermL = resL.result.expr;
        const resR = this.termR.rebuild(findUserFunc);
        if (resR.isErr) {
            return resR;
        }
        const newTermR = resR.result.expr;
        const vtypeRes = this.op.retArg.inferTypes(this.op.retArg.ret, newTermL.vtype, newTermR.vtype);
        if (vtypeRes.isErr) {
            return Result.err({ msg: vtypeRes.error, src: this.src });
        }
        const retVtype = vtypeRes.result.ret;
        const newExpr = new ExprBinOp(this.src, retVtype, this.op, newTermL, newTermR);
        const sideEffect = resL.result.sideEffect | resR.result.sideEffect;
        return Result.ok({ expr: newExpr, sideEffect: sideEffect });
    }
    toString() {
        return `BinanyOp{ op: ${this.op}, vtype: ${Vtype[this.vtype]}, termL: [[ ${this.termL} ]], termR: [[ ${this.termR} ]] }`;
    }
}
export class ExprBracket extends Expr {
    expr;
    rightBracket; // leftBracketはsrcのほう.
    constructor(src, expr, rightBracket) {
        super(ExprKind.BRACKET, expr.vtype, src);
        this.expr = expr;
        this.rightBracket = rightBracket;
    }
    rebuild(findUserFunc) {
        const res = this.expr.rebuild(findUserFunc);
        if (res.isErr) {
            return res;
        }
        const newExpr = new ExprBracket(this.src, res.result.expr, this.rightBracket);
        return Result.ok({ expr: newExpr, sideEffect: res.result.sideEffect });
    }
    toString() {
        return `Bracket{ vtype: ${Vtype[this.vtype]}, expr: ( ${this.expr} ) }`;
    }
}
export class ExprStdFunc extends Expr {
    funcInfo;
    args;
    constructor(src, vtype, funcInfo, args) {
        super(ExprKind.STD_FUNC, vtype, src);
        this.funcInfo = funcInfo;
        this.args = args;
    }
    rebuild(findUserFunc) {
        const newArgs = [];
        const types = [];
        let sideEffect = this.funcInfo.sideEffect;
        for (let i = 0; i < this.args.length; i++) {
            const argRes = this.args[i].rebuild(findUserFunc);
            if (argRes.isErr) {
                return argRes;
            }
            sideEffect |= argRes.result.sideEffect;
            const arg = argRes.result.expr;
            newArgs.push(arg);
            types.push(arg.vtype);
        }
        const res = this.funcInfo.retArg.inferTypes(this.funcInfo.retArg.ret, ...types);
        if (res.isErr) {
            return Result.err({ msg: res.error, src: this.src });
        }
        const retType = res.result.ret;
        const expr = new ExprStdFunc(this.src, retType, this.funcInfo, newArgs);
        return Result.ok({ expr: expr, sideEffect: sideEffect });
    }
    toString() {
        return `StdFunc{ name: ${this.funcInfo.name}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}
export class ExprMemberStdFunc extends Expr {
    funcInfo;
    args;
    constructor(src, vtype, funcInfo, args) {
        super(ExprKind.STD_FUNC, vtype, src);
        this.funcInfo = funcInfo;
        ;
        this.args = args;
    }
    rebuild(findUserFunc) {
        const newArgs = [];
        const types = [];
        let sideEffect = this.funcInfo.sideEffect;
        for (let i = 0; i < this.args.length; i++) {
            const argRes = this.args[i].rebuild(findUserFunc);
            if (argRes.isErr) {
                return argRes;
            }
            sideEffect |= argRes.result.sideEffect;
            const arg = argRes.result.expr;
            newArgs.push(arg);
            types.push(arg.vtype);
        }
        const res = this.funcInfo.retArg.inferTypes(this.funcInfo.retArg.ret, ...types);
        if (res.isErr) {
            return Result.err({ msg: res.error, src: this.src });
        }
        const retType = res.result.ret;
        const expr = new ExprMemberStdFunc(this.src, retType, this.funcInfo, newArgs);
        return Result.ok({ expr: expr, sideEffect: sideEffect });
    }
    toString() {
        return `MemberStdFunc{ name: ${this.funcInfo.name}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}
export class ExprUserFunc extends Expr {
    funcInfo;
    args;
    constructor(src, funcInfo, args) {
        super(ExprKind.USER_FUNC, funcInfo.retArg.ret, src);
        this.funcInfo = funcInfo;
        this.args = args;
    }
    rebuild(findUserFunc) {
        const funcInfo = findUserFunc(this.funcInfo.name);
        const newArgs = [];
        const types = [];
        let sideEffect = funcInfo.sideEffect;
        for (let i = 0; i < this.args.length; i++) {
            const argRes = this.args[i].rebuild(findUserFunc);
            if (argRes.isErr) {
                return argRes;
            }
            sideEffect |= argRes.result.sideEffect;
            const arg = argRes.result.expr;
            newArgs.push(arg);
            types.push(arg.vtype);
        }
        const res = funcInfo.retArg.inferTypes(funcInfo.retArg.ret, ...types);
        if (res.isErr) {
            return Result.err({ msg: res.error, src: this.src });
        }
        const expr = new ExprUserFunc(this.src, funcInfo, newArgs);
        return Result.ok({ expr: expr, sideEffect: sideEffect });
    }
    toString() {
        return `UserFunc{ name: ${this.funcInfo.name}, definition: ${this.funcInfo.definition}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}
export class ExprMemberUserFunc extends Expr {
    funcInfo;
    args;
    constructor(src, funcInfo, args) {
        super(ExprKind.USER_FUNC, funcInfo.retArg.ret, src);
        this.funcInfo = funcInfo;
        this.args = args;
    }
    rebuild(findUserFunc) {
        const funcInfo = findUserFunc(this.funcInfo.name);
        const newArgs = [];
        const types = [];
        let sideEffect = funcInfo.sideEffect;
        for (let i = 0; i < this.args.length; i++) {
            const argRes = this.args[i].rebuild(findUserFunc);
            if (argRes.isErr) {
                return argRes;
            }
            sideEffect |= argRes.result.sideEffect;
            const arg = argRes.result.expr;
            newArgs.push(arg);
            types.push(arg.vtype);
        }
        const res = funcInfo.retArg.inferTypes(funcInfo.retArg.ret, ...types);
        if (res.isErr) {
            return Result.err({ msg: res.error, src: this.src });
        }
        const expr = new ExprMemberUserFunc(this.src, funcInfo, newArgs);
        return Result.ok({ expr: expr, sideEffect: sideEffect });
    }
    toString() {
        return `MemberUserFunc{ name: ${this.funcInfo.name}, definition: ${this.funcInfo.definition}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}
export class ExprVar extends Expr {
    nameInfo;
    constructor(src, vtype, nameInfo) {
        super(ExprKind.VARIABLE, vtype, src);
        this.nameInfo = nameInfo;
    }
}
export class ExprVarVal extends ExprVar {
    constructor(src, nameInfo) {
        super(src, nameInfo.vtype, nameInfo);
    }
    rebuild(findUserFunc) {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });
    }
    toString() {
        return `VarVal{ name: ${this.nameInfo.name}, varId: ${this.nameInfo.varId}, vtype: ${Vtype[this.vtype]} }`;
    }
}
export class ExprArrayVarVal extends ExprVar {
    indexes;
    constructor(src, nameInfo, indexes) {
        super(src, nameInfo.vtype & Vtype.PRIMITIVE_TYPE, nameInfo);
        this.indexes = indexes;
    }
    rebuild(findUserFunc) {
        const newIndexes = [];
        let sideEffect = SideEffect.NONE;
        for (let i = 0; i < this.indexes.length; i++) {
            const indexRes = this.indexes[i].rebuild(findUserFunc);
            if (indexRes.isErr) {
                return indexRes;
            }
            sideEffect |= indexRes.result.sideEffect;
            const index = indexRes.result.expr;
            if (index.vtype !== Vtype.INTEGER) {
                return Result.err({ msg: `${i + 1}番目の添え字の型が不正です.`, src: this.src });
            }
            newIndexes.push(index);
        }
        const expr = new ExprArrayVarVal(this.src, this.nameInfo, newIndexes);
        return Result.ok({ expr: expr, sideEffect: sideEffect });
    }
    toString() {
        return `ArrayVarVal{ name: ${this.nameInfo.name}, varId: ${this.nameInfo.varId}, vtype: ${Vtype[this.vtype]}, indexes: (( ${this.indexes.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}
export class ExprArrayRef extends ExprVar {
    constructor(src, nameInfo) {
        super(src, nameInfo.vtype, nameInfo);
    }
    rebuild(findUserFunc) {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });
    }
    toString() {
        return `ArrayRef{ name: ${this.nameInfo.name}, vtype: ${Vtype[this.vtype]} }`;
    }
}
export var CodeKind;
(function (CodeKind) {
    CodeKind[CodeKind["ASSIGN_ARRAY"] = 0] = "ASSIGN_ARRAY";
    CodeKind[CodeKind["ASSIGN_VAR"] = 1] = "ASSIGN_VAR";
    CodeKind[CodeKind["BLOCK"] = 2] = "BLOCK";
    CodeKind[CodeKind["BREAK"] = 3] = "BREAK";
    CodeKind[CodeKind["CALL_STD_FUNC"] = 4] = "CALL_STD_FUNC";
    CodeKind[CodeKind["CALL_USER_FUNC"] = 5] = "CALL_USER_FUNC";
    CodeKind[CodeKind["CONTINUE"] = 6] = "CONTINUE";
    CodeKind[CodeKind["DEFINE_USER_FUNC"] = 7] = "DEFINE_USER_FUNC";
    CodeKind[CodeKind["DIM"] = 8] = "DIM";
    CodeKind[CodeKind["DO_WHILE"] = 9] = "DO_WHILE";
    CodeKind[CodeKind["FOR"] = 10] = "FOR";
    CodeKind[CodeKind["IF"] = 11] = "IF";
    CodeKind[CodeKind["LET"] = 12] = "LET";
    CodeKind[CodeKind["PRINT"] = 13] = "PRINT";
    CodeKind[CodeKind["RETURN"] = 14] = "RETURN";
})(CodeKind || (CodeKind = {}));
export class Code {
    kind;
    src;
    constructor(kind, src) {
        this.kind = kind;
        this.src = src;
    }
    isFinishedWithReturn() { return false; }
}
export var BlockEndKind;
(function (BlockEndKind) {
    BlockEndKind[BlockEndKind["NONE"] = 0] = "NONE";
    BlockEndKind[BlockEndKind["CONTINUE"] = 1] = "CONTINUE";
    BlockEndKind[BlockEndKind["BREAK"] = 2] = "BREAK";
    BlockEndKind[BlockEndKind["RETURN"] = 4] = "RETURN";
    BlockEndKind[BlockEndKind["ALL"] = 7] = "ALL";
})(BlockEndKind || (BlockEndKind = {}));
export class BlockInfo {
    src;
    id;
    parentId;
    varList;
    body;
    blockEnd;
    constructor(src, id, parentId, varList, body, blockEnd) {
        this.src = src;
        this.id = id;
        this.parentId = parentId;
        this.varList = varList;
        this.body = body;
        this.blockEnd = blockEnd;
    }
    rebuild(findUserFunc) {
        const body = [];
        let sideEffect = SideEffect.NONE;
        for (const c of this.body) {
            const res = c.rebuild(findUserFunc);
            if (res.isErr) {
                return Result.err(res.error);
            }
            body.push(res.result.code);
            sideEffect |= res.result.sideEffect;
        }
        const blockInfo = new BlockInfo(this.src, this.id, this.parentId, this.varList, body, this.blockEnd);
        return Result.ok({ blockInfo: blockInfo, sideEffect: sideEffect });
    }
    isFinishedWithReturn() {
        return this.body.at(-1)?.isFinishedWithReturn() ?? false;
    }
    toString() {
        return `BlockInfo{ id: ${this.id}, parentId: ${this.parentId}, varList: [[ ${this.varList.map(s => `${s}`).join(", ")} ]], src: "${Token.lineToString(this.src)}", blockEnd: ${BlockEndKind[this.blockEnd]} }`;
    }
}
export class Block extends Code {
    blockInfo;
    constructor(blockInfo) {
        super(CodeKind.BLOCK, blockInfo.src);
        this.blockInfo = blockInfo;
    }
    rebuild(findUserFunc) {
        const res = this.blockInfo.rebuild(findUserFunc);
        if (res.isErr) {
            return Result.err(res.error);
        }
        const code = new Block(res.result.blockInfo);
        return Result.ok({ code: code, sideEffect: res.result.sideEffect });
    }
    isFinishedWithReturn() {
        return this.blockInfo.isFinishedWithReturn();
    }
    toString() {
        return `Block{ id: ${this.blockInfo.id}, body: {{ ${this.blockInfo.body.map(s => `[ ${s} ]`).join(", ")} }} }`;
    }
}
export class DefineUserFunc extends Code {
    funcInfo;
    blockInfo;
    constructor(funcInfo, blockInfo) {
        super(CodeKind.DEFINE_USER_FUNC, funcInfo.src);
        this.funcInfo = funcInfo;
        this.blockInfo = blockInfo;
    }
    rebuild(findUserFunc) {
        const res = this.blockInfo.rebuild(findUserFunc);
        if (res.isErr) {
            return Result.err(res.error);
        }
        if (res.result.sideEffect !== SideEffect.NONE) {
            this.funcInfo.addSideEffect(res.result.sideEffect);
        }
        const code = new DefineUserFunc(this.funcInfo, res.result.blockInfo);
        return Result.ok({ code: code, sideEffect: SideEffect.NONE });
    }
    toString() {
        return `DefineUserFunc{ funcInfo: ${this.funcInfo}, body: {{ ${this.blockInfo.body.map(s => `[ ${s} ]`).join(", ")} }} }`;
    }
}
export class Dim extends Code {
    nameInfo;
    dims;
    constructor(src, nameInfo, dims) {
        super(CodeKind.DIM, src);
        this.nameInfo = nameInfo;
        this.dims = dims;
    }
    rebuild(findUserFunc) {
        return Result.ok({ code: this, sideEffect: SideEffect.NONE });
    }
    toString() {
        return `Dim{ name: ${this.nameInfo.name}, vtype: ${Vtype[this.nameInfo.vtype]}, dims: [ ${this.dims} ] }`;
    }
}
export class Let extends Code {
    nameInfo;
    expr;
    constructor(src, nameInfo, expr) {
        super(CodeKind.LET, src);
        this.nameInfo = nameInfo;
        this.expr = expr;
    }
    rebuild(findUserFunc) {
        const res = this.expr.rebuild(findUserFunc);
        if (res.isErr) {
            return Result.err(res.error);
        }
        const newExpr = res.result.expr;
        const vtypeRes = inferVtype(this.nameInfo.vtype, newExpr.vtype);
        if (vtypeRes.isErr) {
            // エラーメッセージが意味不明だが.
            // letの位置では変数の型が確定してない状況で、変数を参照する式で変数の型の推論で型決定されてしまったケースに該当.
            // 初期値の式内に型が特定されていない変数の参照や戻り値の型が特定されてないユーザ関数の呼び出しで生じる.
            // TODO: もっとマシなエラーメッセージを考える.
            return Result.err({ msg: "変数の型と一致しません.", src: this.nameInfo.typedSrc ?? this.src });
        }
        if (this.nameInfo.hasType(Vtype.INFER)) {
            this.nameInfo.updateType(vtypeRes.result, this.src);
        }
        const newCode = new Let(this.src, this.nameInfo, newExpr);
        return Result.ok({ code: newCode, sideEffect: res.result.sideEffect });
    }
    toString() {
        return `Let{ name: ${this.nameInfo.name}, vtype: ${this.nameInfo.vtype}, expr: (( ${this.expr} ))`;
    }
}
export class AssignVar extends Code {
    op;
    nameInfo;
    expr;
    constructor(src, op, nameInfo, expr) {
        super(CodeKind.ASSIGN_VAR, src);
        this.op = op;
        this.nameInfo = nameInfo;
        this.expr = expr;
    }
    rebuild(findUserFunc) {
        const vtypeRes = inferVtype(this.op.vtype, this.nameInfo.vtype);
        if (vtypeRes.isErr) {
            return Result.err({ msg: `変数の型と代入演算子の型が一致しません. [ ${vtypeRes.error} ]`, src: this.src });
        }
        const res = this.expr.rebuild(findUserFunc);
        if (res.isErr) {
            return Result.err(res.error);
        }
        const newExpr = res.result.expr;
        if (this.nameInfo.vtype !== newExpr.vtype) {
            return Result.err({ msg: "代入の型が不正です.", src: this.src });
        }
        const newCode = new AssignVar(this.src, this.op, this.nameInfo, newExpr);
        return Result.ok({ code: newCode, sideEffect: res.result.sideEffect });
    }
    toString() {
        return `AssignVar{ name: ${this.nameInfo.name}, op: "${this.op.op}", expr: (( ${this.expr} )) }`;
    }
}
export class AssignArray extends Code {
    op;
    nameInfo;
    indexes;
    expr;
    constructor(src, op, nameInfo, indexes, expr) {
        super(CodeKind.ASSIGN_ARRAY, src);
        this.op = op;
        this.nameInfo = nameInfo;
        this.indexes = indexes;
        this.expr = expr;
    }
    rebuild(findUserFunc) {
        const newIndexes = [];
        let sideEffect = SideEffect.NONE;
        for (let i = 0; i < this.indexes.length; i++) {
            const indexRes = this.indexes[i].rebuild(findUserFunc);
            if (indexRes.isErr) {
                return Result.err(indexRes.error);
            }
            sideEffect |= indexRes.result.sideEffect;
            const index = indexRes.result.expr;
            if (index.vtype !== Vtype.INTEGER) {
                return Result.err({ msg: `${i + 1}番目の添え字の型が不正です.`, src: this.src });
            }
            newIndexes.push(index);
        }
        const newExprRes = this.expr.rebuild(findUserFunc);
        if (newExprRes.isErr) {
            return Result.err(newExprRes.error);
        }
        sideEffect |= newExprRes.result.sideEffect;
        const newExpr = newExprRes.result.expr;
        if ((this.nameInfo.vtype & Vtype.PRIMITIVE_TYPE) !== newExpr.vtype) {
            return Result.err({ msg: "代入の型が不正です.", src: this.src });
        }
        const newCode = new AssignArray(this.src, this.op, this.nameInfo, newIndexes, newExpr);
        return Result.ok({ code: newCode, sideEffect: sideEffect });
    }
    toString() {
        return `AssignArray{ name: ${this.nameInfo.name}, op: "${this.op.op}", indexes: (( ${this.indexes.map(e => `[[ ${e} ]]`).join(", ")} )) expr: (( ${this.expr} )) }`;
    }
}
export class If extends Code {
    srcList;
    testExprList;
    blockInfoList;
    constructor(srcList, testExprList, blockInfoList) {
        super(CodeKind.IF, srcList[0]);
        this.srcList = srcList;
        this.testExprList = testExprList;
        this.blockInfoList = blockInfoList;
    }
    rebuild(findUserFunc) {
        let sideEffect = SideEffect.NONE;
        const newTestExprList = [];
        const newBlockInfoList = [];
        for (let i = 0; i < this.testExprList.length; i++) {
            const testExprRes = this.testExprList[i].rebuild(findUserFunc);
            if (testExprRes.isErr) {
                return Result.err(testExprRes.error);
            }
            sideEffect |= testExprRes.result.sideEffect;
            const testExpr = testExprRes.result.expr;
            if (testExpr.vtype !== Vtype.BOOLEAN) {
                return Result.err({ msg: "条件式の型が不正です.", src: this.srcList[i] });
            }
            newTestExprList.push(testExpr);
        }
        for (let i = 0; i < this.blockInfoList.length; i++) {
            const blockInfoRes = this.blockInfoList[i].rebuild(findUserFunc);
            if (blockInfoRes.isErr) {
                return Result.err(blockInfoRes.error);
            }
            sideEffect |= blockInfoRes.result.sideEffect;
            newBlockInfoList.push(blockInfoRes.result.blockInfo);
        }
        const newCode = new If(this.srcList, newTestExprList, newBlockInfoList);
        return Result.ok({ code: newCode, sideEffect: sideEffect });
    }
    isFinishedWithReturn() {
        if (this.testExprList.length === this.blockInfoList.length) {
            return false;
        }
        for (const bi of this.blockInfoList) {
            if (!bi.isFinishedWithReturn()) {
                return false;
            }
        }
        return true;
    }
    toString() {
        return `If{ [[ ${this.blockInfoList.map((bi, i) => `testExpr: ${this.testExprList.at(i)}, code: {{ ${bi} }}`).join(", ")} ]] }`;
    }
}
export class CallStdFunc extends Code {
    funcInfo;
    args;
    constructor(src, funcInfo, args) {
        super(CodeKind.CALL_STD_FUNC, src);
        this.funcInfo = funcInfo;
        this.args = args;
    }
    rebuild(findUserFunc) {
        const newArgs = [];
        const types = [];
        let sideEffect = this.funcInfo.sideEffect;
        for (let i = 0; i < this.args.length; i++) {
            const argRes = this.args[i].rebuild(findUserFunc);
            if (argRes.isErr) {
                return Result.err(argRes.error);
            }
            sideEffect |= argRes.result.sideEffect;
            const arg = argRes.result.expr;
            newArgs.push(arg);
            types.push(arg.vtype);
        }
        const res = this.funcInfo.retArg.inferTypes(this.funcInfo.retArg.ret, ...types);
        if (res.isErr) {
            return Result.err({ msg: res.error, src: this.src });
        }
        const newCode = new CallStdFunc(this.src, this.funcInfo, newArgs);
        return Result.ok({ code: newCode, sideEffect: sideEffect });
    }
    toString() {
        return `CallStdFunc{ func: ${this.funcInfo.name}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}
export class CallUserFunc extends Code {
    funcInfo;
    args;
    constructor(src, funcInfo, args) {
        super(CodeKind.CALL_USER_FUNC, src);
        this.funcInfo = funcInfo;
        this.args = args;
    }
    rebuild(findUserFunc) {
        const funcInfo = findUserFunc(this.funcInfo.name);
        const newArgs = [];
        const types = [];
        let sideEffect = funcInfo.sideEffect;
        for (let i = 0; i < this.args.length; i++) {
            const argRes = this.args[i].rebuild(findUserFunc);
            if (argRes.isErr) {
                return Result.err(argRes.error);
            }
            sideEffect |= argRes.result.sideEffect;
            const arg = argRes.result.expr;
            newArgs.push(arg);
            types.push(arg.vtype);
        }
        const res = funcInfo.retArg.inferTypes(funcInfo.retArg.ret, ...types);
        if (res.isErr) {
            return Result.err({ msg: res.error, src: this.src });
        }
        const newCode = new CallUserFunc(this.src, funcInfo, newArgs);
        return Result.ok({ code: newCode, sideEffect: sideEffect });
    }
    toString() {
        return `CallUserFunc{ func: ${this.funcInfo.name}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}
export class For extends Code {
    loopCounter;
    blockInfo;
    initValue;
    endValue;
    stepValue;
    constructor(src, loopCounter, blockInfo, initValue, endValue, stepValue) {
        super(CodeKind.FOR, src);
        this.loopCounter = loopCounter;
        this.blockInfo = blockInfo;
        this.initValue = initValue;
        this.endValue = endValue;
        this.stepValue = stepValue;
    }
    rebuild(findUserFunc) {
        const blockInfoRes = this.blockInfo.rebuild(findUserFunc);
        if (blockInfoRes.isErr) {
            return Result.err(blockInfoRes.error);
        }
        let sideEffect = blockInfoRes.result.sideEffect;
        const blockInfo = blockInfoRes.result.blockInfo;
        const initExprRes = this.initValue.expr.rebuild(findUserFunc);
        if (initExprRes.isErr) {
            return Result.err(initExprRes.error);
        }
        sideEffect |= initExprRes.result.sideEffect;
        const initValue = { nameInfo: this.initValue.nameInfo, expr: initExprRes.result.expr };
        if (initValue.expr.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "初期値の型が不正です.", src: this.src });
        }
        const endExprRes = this.endValue.expr.rebuild(findUserFunc);
        if (endExprRes.isErr) {
            return Result.err(endExprRes.error);
        }
        sideEffect |= endExprRes.result.sideEffect;
        const endValue = { nameInfo: this.endValue.nameInfo, expr: endExprRes.result.expr };
        if (endValue.expr.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "終端値の型が不正です.", src: this.src });
        }
        let stepExpr = null;
        if (this.stepValue.expr !== null) {
            const stepExprRes = this.stepValue.expr.rebuild(findUserFunc);
            if (stepExprRes.isErr) {
                return Result.err(stepExprRes.error);
            }
            sideEffect |= stepExprRes.result.sideEffect;
            stepExpr = stepExprRes.result.expr;
            if (stepExpr.vtype !== Vtype.INTEGER) {
                return Result.err({ msg: "増減値の型が不正です.", src: this.src });
            }
        }
        const stepValue = { nameInfo: this.stepValue.nameInfo, expr: stepExpr };
        const newCode = new For(this.src, this.loopCounter, blockInfo, initValue, endValue, stepValue);
        return Result.ok({ code: newCode, sideEffect: sideEffect });
    }
    toString() {
        return `For{ loopCounter: ${this.loopCounter.name}, init: (( ${this.initValue.expr} )), end: (( ${this.endValue.expr} )), step: (( ${this.stepValue.expr} )), code: {{ ${this.blockInfo.body.map(c => `${c}`).join(", ")} }} }`;
    }
}
export class DoWhile extends Code {
    testExpr;
    blockInfo;
    constructor(src, testExpr, blockInfo) {
        super(CodeKind.DO_WHILE, src);
        this.testExpr = testExpr;
        this.blockInfo = blockInfo;
    }
    rebuild(findUserFunc) {
        const testExprRes = this.testExpr.rebuild(findUserFunc);
        if (testExprRes.isErr) {
            return Result.err(testExprRes.error);
        }
        let sideEffect = testExprRes.result.sideEffect;
        const testExpr = testExprRes.result.expr;
        if (testExpr.vtype !== Vtype.BOOLEAN) {
            return Result.err({ msg: "条件式の型が不正です.", src: this.src });
        }
        const blockInfoRes = this.blockInfo.rebuild(findUserFunc);
        if (blockInfoRes.isErr) {
            return Result.err(blockInfoRes.error);
        }
        sideEffect |= blockInfoRes.result.sideEffect;
        const blockInfo = blockInfoRes.result.blockInfo;
        const newCode = new DoWhile(this.src, testExpr, blockInfo);
        return Result.ok({ code: newCode, sideEffect: sideEffect });
    }
    toString() {
        return `DoWhile{ test: (( ${this.testExpr} )), code: {{ ${this.blockInfo.body.map(c => `${c}`).join(", ")} }} }`;
    }
}
export class Break extends Code {
    blockId;
    blockSrc;
    constructor(src, blockId, blockSrc) {
        super(CodeKind.BREAK, src);
        this.blockId = blockId;
        this.blockSrc = blockSrc;
    }
    rebuild(findUserFunc) {
        return Result.ok({ code: this, sideEffect: SideEffect.NONE });
    }
    toString() {
        return `Break{ blockId: ${this.blockId}, blockSrc: ${Token.lineToString(this.blockSrc)} }`;
    }
}
export class Continue extends Code {
    blockId;
    blockSrc;
    constructor(src, blockId, blockSrc) {
        super(CodeKind.BREAK, src);
        this.blockId = blockId;
        this.blockSrc = blockSrc;
    }
    rebuild(findUserFunc) {
        return Result.ok({ code: this, sideEffect: SideEffect.NONE });
    }
    toString() {
        return `Continue{ blockId: ${this.blockId}, blockSrc: ${Token.lineToString(this.blockSrc)} }`;
    }
}
export class Return extends Code {
    funcInfo; // 定義由来のFuncInfoのはず.
    value;
    constructor(src, funcInfo, value) {
        super(CodeKind.RETURN, src);
        this.funcInfo = funcInfo;
        if (funcInfo.retArg.ret === Vtype.VOID) {
            U.assert(value === undefined);
            this.value = null;
        }
        else {
            U.assert(value !== undefined);
            this.value = value;
        }
    }
    rebuild(findUserFunc) {
        if (this.value === null) {
            // sub
            return Result.ok({ code: this, sideEffect: SideEffect.NONE });
        }
        const valueRes = this.value.rebuild(findUserFunc);
        if (valueRes.isErr) {
            return Result.err(valueRes.error);
        }
        const sideEffect = valueRes.result.sideEffect;
        const newValue = valueRes.result.expr;
        if (this.funcInfo.retArg.ret !== newValue.vtype) {
            return Result.err({ msg: "戻り値の型が不正です.", src: this.src });
        }
        const newCode = new Return(this.src, this.funcInfo, newValue);
        return Result.ok({ code: newCode, sideEffect: sideEffect });
    }
    isFinishedWithReturn() {
        return true;
    }
    toString() {
        if (this.value === null) {
            return `Return{ sub: ${this.funcInfo.name} }`;
        }
        else {
            return `Return{ func: ${this.funcInfo.name}, value: (( ${this.value} )) }`;
        }
    }
}
export class Print extends Code {
    args;
    constructor(src, args) {
        super(CodeKind.PRINT, src);
        this.args = args;
    }
    rebuild(findUserFunc) {
        let sideEffect = SideEffect.NONE;
        const newArgs = [];
        for (let i = 0; i < this.args.length; i++) {
            const argRes = this.args[i].rebuild(findUserFunc);
            if (argRes.isErr) {
                return Result.err(argRes.error);
            }
            sideEffect |= argRes.result.sideEffect;
            newArgs.push(argRes.result.expr);
        }
        const newCode = new Print(this.src, newArgs);
        return Result.ok({ code: newCode, sideEffect: sideEffect });
    }
    toString() {
        return `Print{ args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}
export default {};
