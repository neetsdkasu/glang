//
// Code
// 
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("code", LogLevel.ERROR | LogLevel.WARN);

import { Token } from "./scanner.js";
import { Result } from "./utils.js";
import { StdFunc } from "./command.js";
import * as U from "./utils.js";

export type RebuildError = { msg: string, src: Readonly<Token | Token[]> };

export class ParsedSource {
    readonly blockInfo: BlockInfo;
    readonly totalBlockCount: number;
    readonly totalVarCount: number;

    constructor(blockInfo: BlockInfo, totalBlockCount: number, totalVarCount: number) {
        this.blockInfo = blockInfo;
        this.totalBlockCount = totalBlockCount;
        this.totalVarCount = totalVarCount;
    }

    toString(): string {
        return `ParsedSource{ blockInfo: ${this.blockInfo}, totalBlockCount: ${this.totalBlockCount}, totalVarCount: ${this.totalVarCount} }`;
    }
}

export enum Vtype {
    NONE            = 0,
    VOID            = 1 << 0,
    BOOLEAN         = 1 << 1,
    FLOATING_POINT  = 1 << 2,
    INTEGER         = 1 << 3,
    STRING          = 1 << 4,
    ARRAY_TYPE      = 1 << 5,
    ARRAY_SIZE_1    = 1 << 6,
    ARRAY_1D        = ARRAY_TYPE | (1 * ARRAY_SIZE_1),  // (1 << 6)
    ARRAY_2D        = ARRAY_TYPE | (2 * ARRAY_SIZE_1),  // (2 << 6) === (1 << 7)
    ARRAY_3D        = ARRAY_TYPE | (3 * ARRAY_SIZE_1),  // (3 << 6) === (1 << 6) | (1 << 7)
    ARRAY_SIZE      = 3 * ARRAY_SIZE_1,
    SUB             = 1 << 8,
    FUNC            = 1 << 9,
    REFERENCE_VAR   = 1 << 10,
    INFER           = 1 << 11,
    PRIMITIVE_TYPE  = BOOLEAN | INTEGER | FLOATING_POINT | STRING,
    NUMBER_TYPE     = INTEGER | FLOATING_POINT,
    LOGICAL_TYPE    = BOOLEAN | INTEGER,
    COMPARE_TYPE    = NUMBER_TYPE | STRING,
    CONCAT_TYPE     = NUMBER_TYPE | STRING,
    NON_PRIMITIVE   = ARRAY_TYPE | SUB | FUNC | REFERENCE_VAR,
    BOOL_ARRAY      = BOOLEAN | ARRAY_1D,
    BOOL_ARRAY_2D   = BOOLEAN | ARRAY_2D,
    BOOL_ARRAY_3D   = BOOLEAN | ARRAY_3D,
    FLOAT_ARRAY     = FLOATING_POINT | ARRAY_1D,
    FLOAT_ARRAY_2D  = FLOATING_POINT | ARRAY_2D,
    FLOAT_ARRAY_3D  = FLOATING_POINT | ARRAY_3D,
    INT_ARRAY       = INTEGER | ARRAY_1D,
    INT_ARRAY_2D    = INTEGER | ARRAY_2D,
    INT_ARRAY_3D    = INTEGER | ARRAY_3D,
    STR_ARRAY       = STRING | ARRAY_1D,
    STR_ARRAY_2D    = STRING | ARRAY_2D,
    STR_ARRAY_3D    = STRING | ARRAY_3D,
    INFER_PRIMITIVE = INFER | PRIMITIVE_TYPE,
    INFER_NUMBER    = INFER | NUMBER_TYPE,
    INFER_LOGICAL   = INFER | LOGICAL_TYPE,
    INFER_COMPARE   = INFER | COMPARE_TYPE,
    INFER_CONCAT    = INFER | CONCAT_TYPE,
    INFER_ARRAY     = INFER | ARRAY_TYPE,
    INFER_REFERENCE = INFER | REFERENCE_VAR,
    INFER_CALLABLE  = INFER | SUB | FUNC,
    INFER_ALL       = INFER | PRIMITIVE_TYPE | NON_PRIMITIVE,
    UNKNOWN         = VOID | INFER_ALL
}

export function arrayDimension(vtype: Vtype): number {
    const size = Math.floor((vtype & (Vtype.ARRAY_SIZE)) / (Vtype.ARRAY_SIZE_1));
    if (1 <= size && size <= 3) {
        return size;
    } else {
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
export function inferVtype(t1: Vtype, t2: Vtype, t3?: Vtype): Result<Vtype,string> {
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
                } else if (infNonp) {
                    return Result.ok(infNonp | Vtype.INFER);
                } else {
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
            } else {
                return Result.ok(infPrim | infNonp | Vtype.INFER);
            }
        }
        // t1かt2のどちらかにのみINFERがある、他方は確定の型.INFER側が確定の型に決定できるか判定する.
        if (t1 & Vtype.INFER) {
            if (t1 === Vtype.INFER_ARRAY) {
                if (t2 & Vtype.ARRAY_TYPE) {
                    return Result.ok(t2);
                }
            } else if (t1 === Vtype.INFER_REFERENCE) {
                if (t2 & Vtype.REFERENCE_VAR) {
                    return Result.ok(t2);
                }
            } else if ((t1 & t2) === (t2 & Vtype.INFER_ALL)) {
                return Result.ok(t2);
            }
        } else if (t2 & Vtype.INFER) {
            if (t2 === Vtype.INFER_ARRAY) {
                if (t1 & Vtype.ARRAY_TYPE) {
                    return Result.ok(t1);
                }
            } else if (t2 === Vtype.INFER_REFERENCE) {
                if (t1 & Vtype.REFERENCE_VAR) {
                    return Result.ok(t1);
                }
            } else if ((t1 & t2) === (t1 & Vtype.INFER_ALL)) {
                return Result.ok(t1);
            }
        }
        return Result.err("型の整合性がとれません.");    
    }
    const res = inferVtype(t1, t2);
    if (res.isErr) {
        return res;
    } else {
        return inferVtype(res.result, t3);
    }
}

/**
 * 変数名およびユーザ関数名の簡易情報を管理する.
 */
export class NameInfo {
    readonly src: Readonly<Token[]>;
    readonly name: string;
    readonly varId: number;
    readonly blockId: number;
    readonly blockVarId: number;
    readonly isLoopCounter: boolean;
    #vtype: Vtype;
    #count: number = 0;
    #written: number = 0;
    #lastWritten: number = 0;
    #unused: number[] = [];
    #typedSrc: Token | Readonly<Token[]> | undefined;

    constructor(src: Token[], name: string, vtype: Vtype, varId: number, blockId: number, blockVarId: number, isLoopCounter?: boolean) {
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

    suck(garbage: NameInfo): void {
        this.#count = garbage.#count;
        this.#written = garbage.#written;
        this.#lastWritten = garbage.#lastWritten;
        this.#unused = [...garbage.#unused];
    }

    /**
     * 変数の読み込み回数.
     */
    get count(): number {
        return this.#count;
    }

    /**
     * 変数の書き込み回数.
     */
    get written(): number {
        return this.#written;
    }

    get vtype(): Vtype {
        return this.#vtype;
    }
    
    /**
     * 変数への最後の書き込み後から読み込みがあったかどうか.
     */
    get isUnused(): boolean {
        return this.#count <= this.#lastWritten;
    }

    /**
     * 変数への書き込み後に読み込みがなかったその書き込みタイミングのリスト.
     */
    get unused(): Readonly<number[]> {
        if (this.isUnused) {
            const unused = [this.#written];
            unused.push(...this.#unused);
            return unused;
        } else {
            return this.#unused;
        }
    }

    get typedSrc(): Token | Readonly<Token[]> | undefined {
        return this.#typedSrc;
    }

    /**
     * 変数の型にINFERが含まれている場合で型を特定できるときに呼び出す.
     * @param vtype 特定した型.
     */
    updateType(vtype: Vtype, typedSrc: Token | Readonly<Token[]>): void {
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
    incrementCounter(): void {
        this.#count++;
    }

    /**
     * 変数の書き込み回数をインクリメント.
     */
    markWritten(): void {
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
    hasType(vtype: Vtype): boolean {
        return (this.vtype & vtype) === vtype;
    }

    /**
     * 複数のVtypeのいずれかを含んでいるかを判定.
     * @param vtype 
     * @returns 含んでいるときtrue.そうでないときfalse.
     */
    hasAnyType(vtype: Vtype): boolean {
        return (this.vtype & vtype) !== 0;
    }

    toString(): string {
        return `NameInfo{ src: "${Token.lineToString(this.src)}", name: ${this.name}, vtype: ${Vtype[this.vtype]}, varId: ${this.varId}, blockId: ${this.blockId}, blockVarId: ${this.blockVarId}, count: ${this.#count}, written: ${this.written}, unused: ${this.unused.length}, loopCounter: ${this.isLoopCounter} }`;
    }
}


export class RetArg {
    readonly ret: Vtype;
    readonly args: Readonly<Vtype[]>;

    constructor(ret: Vtype, args: Vtype[]) {
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
    checkConsistencyWith(def: RetArg): Result<boolean,string> {
        let hasInfer = false;
        if (this.ret & Vtype.INFER) {
            hasInfer = true;
            if (inferVtype(this.ret, def.ret).isErr) {
                return Result.err(`戻り値の型が不一致 (this: ${Vtype[this.ret]}, def: ${Vtype[def.ret]})`);
            }
        } else if (this.ret !== def.ret) {
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
                    return Result.err(`${i+1}番目の引数の型が不一致 (this: ${Vtype[ta]}, def: ${Vtype[da]})`);
                }
            } else if (ta !== da) {
                return Result.err(`${i+1}番目の引数の型が不一致 (this: ${Vtype[ta]}, def: ${Vtype[da]})`);
            }
        }
        return Result.ok(hasInfer);
    }

    get hasNoArg(): boolean {
        return this.args.length === 0;
    }

    /**
     * INFER属性が付いてるものは全部共通の型になることを前提に型検査&型決定を行う.
     * @param ret 
     * @param args 
     * @returns 
     */
    inferTypes(ret: Vtype, ...args: Vtype[]): Result<{ ret: Vtype; args: Vtype[]; }, string> {
        U.assert(args.length === this.args.length);
        const retRes = inferVtype(this.ret, ret);
        if (retRes.isErr) {
            return Result.err(`戻り値の型が一致しません. [ ${retRes.error} ]`);
        }
        ret = retRes.result;
        let vtype: Vtype | undefined = (this.ret & Vtype.INFER) ? ret : undefined;
        for (let i = 0; i < args.length; i++) {
            const argRes = inferVtype(args[i], this.args[i]);
            if (argRes.isErr) {
                return Result.err(`${i+1}番目の引数の型が一致しません. [ ${argRes.error} ]`);
            }
            args[i] = argRes.result;
            if (this.args[i] & Vtype.INFER) {
                if (vtype !== undefined) {
                    const res = inferVtype(vtype, args[i]);
                    if (res.isErr) {
                        return Result.err(`${i+1}番目の引数の型が一致しません. [ ${res.error} ]`);
                    }
                    vtype = res.result;
                } else {
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

    toString(): string {
        return `RetArg{ ret: ${Vtype[this.ret]}, args: [[ ${this.args.map(t => Vtype[t])} ]] }`;
    }
}

export enum SideEffect {
    NONE,
    WRITE_GLOBAL_VAR    = 1 << 0,
    ACCESS_IO           = 1 << 1,
    CHANGE_RUNNER_STATE = 1 << 2
    // ALL = WRITE_GLOBAL_VAR | ACCESS_IO | CHANGE_RUNNER_STATE
}

export class Overload {
    readonly stdfuncId: StdFunc;
    readonly retArg: RetArg;

    constructor(stdfuncId: StdFunc, retArg: RetArg) {
        this.stdfuncId = stdfuncId;
        this.retArg = retArg;
    }

    toString(): string {
        return `Overload{ stdfuncId: ${StdFunc[this.stdfuncId]} }`;
    }
}

export class StdFuncInfo {
    readonly name: string;
    readonly retArg: RetArg;
    readonly overloads: Readonly<Overload[]>;
    readonly sideEffect: SideEffect;

    constructor(name: string, retArg: RetArg, overloads: Overload[], sideEffect: SideEffect) {
        this.name = name;
        this.retArg = retArg;
        this.overloads = overloads;
        this.sideEffect = sideEffect;
    }

    get isFunc(): boolean {
        return !this.isSub;
    }

    get isSub(): boolean {
        return this.retArg.ret === Vtype.VOID;
    }

    toString(): string {
        return `StdFuncInfo{ name: ${this.name}, retArg: ${this.retArg}, sideEffect: ${SideEffect[this.sideEffect]} }`;
    }
}

export class FuncInfo {
    readonly src: Readonly<Token[]>;
    readonly name: string;
    readonly retArg: RetArg;
    readonly varId: number;
    readonly definition: boolean;
    readonly argNames: Readonly<NameInfo[]> | undefined;
    readonly outerBlockId: number | undefined;
    readonly innerBlockId: number | undefined;
    readonly isMain: boolean | undefined;
    #sideEffect: SideEffect = SideEffect.NONE;
    #dependencies: Set<string> | null;
    #isRecursive: boolean = false;

    constructor(src: Token[], name: string, retArg: RetArg, varId: number, definition?: { argNames: NameInfo[], outerBlockId: number, innerBlockId: number } | undefined, isMain?: boolean | undefined) {
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
        } else {
            this.definition = true;
            this.argNames = definition.argNames;
            this.outerBlockId = definition.outerBlockId;
            this.innerBlockId = definition.innerBlockId;
            this.#dependencies = new Set();
        }
        this.isMain = isMain;
    }

    get sideEffect(): SideEffect {
        return this.#sideEffect;
    }

    get isRecursive(): boolean {
        return this.#isRecursive;
    }

    get isFunc(): boolean {
        return !this.isSub;
    }

    get isSub(): boolean {
        return this.retArg.ret === Vtype.VOID;
    }

    getDependencies(): Readonly<Set<string>> {
        U.assert(this.definition);
        U.assert(this.#dependencies !== null);
        return this.#dependencies;
    }

    addSideEffect(sideEffect: SideEffect) {
        this.#sideEffect |= sideEffect;
    }

    /**
     * 内部ブロックから呼び出すユーザ関数名を記録し依存関係を明確にする.
     * 実在するユーザ関数名かのチェックはしないのでこのメソッドを呼び出す側の責任.
     * @param userFuncName 
     */
    addDependency(userFuncName: string): void {
        U.assert(this.definition);
        U.assert(this.#dependencies !== null);
        this.#dependencies.add(userFuncName);
        if (userFuncName === this.name) {
            this.#isRecursive = true;
        }
    }

    validate(other: FuncInfo): Result<boolean,string> {
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

    toString(): string {
        return `FuncInfo{ src: ${Token.lineToString(this.src)}, name: ${this.name}, retArg: ${this.retArg}, varId: ${this.varId}, definition: ${this.definition}, sideEffect: ${SideEffect[this.#sideEffect]}, argNames: [${this.argNames}], outerBlockId: ${this.outerBlockId}, innerBlockId: ${this.innerBlockId}, isMain: ${this.isMain} }`;
    }
}

export enum BinaryOpKind {
    ADD,                // "+"
    SUBTRACT,           // "-"
    MULTIPLY,           // "*"
    DIVIDE,             // "/"
    INT_DIVIDE,         // "\\"
    INT_REMINDER,       // "%"
    BITWISE_AND,        // "&"
    BITWISE_OR,         // "|"
    BITWISE_XOR,        // "^"
    BITWISE_ASHIFT_L,   // "<<"
    BITWISE_ASHIFT_R,   // ">>"
    BITWISE_LSHIFT_L,   // "<<<"
    BITWISE_LSHIFT_R,   // ">>>"
    SHORTCIRCUIT_AND,   // "&&"
    SHORTCIRGUIT_OR,    // "||"
    COMPARE_EQ,         // "=="
    COMPARE_NE,         // "!="
    COMPARE_LT,         // "<"
    COMPARE_LE,         // "<="
    COMPARE_GT,         // ">"
    COMPARE_GE          // ">="
}

export class BinaryOpInfo {
    readonly kind: BinaryOpKind;
    readonly op: string;
    readonly priority: number;
    readonly retArg: RetArg;

    constructor(kind: BinaryOpKind, op: string, priority: number, retArg: RetArg) {
        this.kind = kind;
        this.op = op;
        this.priority = priority;
        this.retArg = retArg;
    }

    toString(): string {
        return `BinOpInfo{ kind: ${BinaryOpKind[this.kind]}, op: ${this.op}, priority: ${this.priority}, retArg: ${this.retArg} }`;
    }
}

export enum UnaryOpKind {
    POSITIVE_SIGN,  // "+"
    NEGATIVE_SIGN,  // "-"
    BITWISE_NOT,    // "~"
    LOGICAL_NOT     // "!"
}

export class UnaryOpInfo {
    readonly kind: UnaryOpKind;
    readonly op: string;
    readonly vtype: Vtype

    constructor(kind: UnaryOpKind, op: string, vtype: Vtype) {
        this.kind = kind;
        this.op = op;
        this.vtype = vtype;
    }

    toString(): string {
        return `UnaryOpInfo{ kind: ${UnaryOpKind[this.kind]}, op: ${this.op}, vtype: ${Vtype[this.vtype]} }`;
    }
}

export enum AssignKind {
    ASSIGN,             // "="
    ADD,                // "+="
    SUBTRACT,           // "-="
    MULTIPLY,           // "*="
    DIVIDE,             // "/="
    INT_DIVIDE,         // "\\="
    INT_REMINDER,       // "%="
    BITWISE_AND,        // "&="
    BITWISE_OR,         // "|="
    BITWISE_XOR,        // "^="
    BITWISE_ASHIFT_L,   // "<<="
    BITWISE_ASHIFT_R,   // ">>="
    BITWISE_LSHIFT_L,   // "<<<="
    BITWISE_LSHIFT_R,   // ">>>="
}

export class AssignOpInfo {
    readonly kind: AssignKind;
    readonly op: string;
    readonly vtype: Vtype;

    constructor(kind: AssignKind, op: string, vtype: Vtype) {
        this.kind = kind;
        this.op = op;
        this.vtype = vtype;
    }

    toString(): string {
        return `AssignOpInfo{ kind: ${AssignKind[this.kind]}, op: "${this.op}", vtype: ${Vtype[this.vtype]} }`;
    }
}

export enum ExprKind {
    LITERAL,
    VARIABLE,
    UNARY_OP,
    BINARY_OP,
    STD_FUNC,
    USER_FUNC,
    BRACKET
}

export abstract class Expr {
    readonly kind: ExprKind;
    readonly vtype: Vtype;
    readonly src: Token;

    constructor(kind: ExprKind, vtype: Vtype, src: Token) {
        this.kind = kind;
        this.vtype = vtype;
        this.src = src;
    }

    abstract rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr, sideEffect: SideEffect }, RebuildError>;
}

export class ExprLitInt extends Expr {
    readonly value: number;
    readonly unaryOp: UnaryOpInfo | undefined; // valueに適用済みの単項演算子.

    constructor(src: Token, value: number, unaryOp?: UnaryOpInfo) {
        super(ExprKind.LITERAL, Vtype.INTEGER, src);
        this.value = value;
        this.unaryOp = unaryOp;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });        
    }

    toString(): string {
        if (this.unaryOp) {
            return `LitInt{ value: ${this.value}, unaryOp: ${this.unaryOp} }`;
        } else {
            return `LitInt{ value: ${this.value} }`;
        }
    }
}

export class ExprLitFloat extends Expr {
    readonly value: number;
    readonly unaryOp: UnaryOpInfo | undefined; // valueに適用済みの単項演算子.

    constructor(src: Token, value: number, unaryOp?: UnaryOpInfo) {
        super(ExprKind.LITERAL, Vtype.FLOATING_POINT, src);
        this.value = value;
        this.unaryOp = unaryOp;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });        
    }

    toString(): string {
        if (this.unaryOp) {
            return `LitFloat{ value: ${this.value}, unaryOp: ${this.unaryOp} }`;
        } else {
            return `LitFloat{ value: ${this.value} }`;
        }
    }
}

export class ExprLitBoolean extends Expr {
    readonly value: boolean;
    readonly unaryOp: UnaryOpInfo| undefined; // valueに適用済みの単項演算子.

    constructor(src: Token, value: boolean, unaryOp?: UnaryOpInfo) {
        super(ExprKind.LITERAL, Vtype.BOOLEAN, src);
        this.value = value;
        this.unaryOp = unaryOp;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });        
    }

    toString(): string {
        if (this.unaryOp) {
            return `LitBoolean{ value: ${this.value}, unaryOp: ${this.unaryOp} }`;
        } else {
            return `LitBoolean{ value: ${this.value} }`;
        }
    }
}

export class ExprLitString extends Expr {
    readonly value: string;

    constructor(src: Token, value: string) {
        super(ExprKind.LITERAL, Vtype.STRING, src);
        this.value = value;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });        
    }

    toString(): string {
        return `LitString{ value: "${this.value.replaceAll('"', '""')}" }`;
    }
}

export class ExprUnaryOp extends Expr {
    readonly op: UnaryOpInfo;
    readonly term: Expr;

    constructor(src: Token, vtype: Vtype, op: UnaryOpInfo, term: Expr) {
        super(ExprKind.UNARY_OP, vtype, src);
        this.op = op;
        this.term = term;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
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

    toString(): string {
        return `UnaryOp{ op: ${this.op}, vtype: ${Vtype[this.vtype]}, term: [[ ${this.term} ]] }`;
    }
}

export class ExprBinOp extends Expr {
    readonly op: BinaryOpInfo;
    readonly termL: Expr;
    readonly termR: Expr;

    constructor(src: Token, vtype: Vtype, op: BinaryOpInfo, termL: Expr, termR: Expr) {
        super(ExprKind.BINARY_OP, vtype, src);
        this.op = op;
        this.termL = termL;
        this.termR = termR;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
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

    toString(): string {
        return `BinanyOp{ op: ${this.op}, vtype: ${Vtype[this.vtype]}, termL: [[ ${this.termL} ]], termR: [[ ${this.termR} ]] }`;
    }
}

export class ExprBracket extends Expr {
    readonly expr: Expr;
    readonly rightBracket: Token; // leftBracketはsrcのほう.

    constructor(src: Token, expr: Expr, rightBracket: Token) {
        super(ExprKind.BRACKET, expr.vtype, src);
        this.expr = expr;
        this.rightBracket = rightBracket;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        const res = this.expr.rebuild(findUserFunc);
        if (res.isErr) {
            return res;
        }
        const newExpr = new ExprBracket(this.src, res.result.expr, this.rightBracket);
        return Result.ok({ expr: newExpr, sideEffect: res.result.sideEffect });
    }

    toString(): string {
        return `Bracket{ vtype: ${Vtype[this.vtype]}, expr: ( ${this.expr} ) }`;
    }
}

export class ExprStdFunc extends Expr {
    readonly funcInfo: StdFuncInfo;
    readonly args: Readonly<Expr[]>;
    readonly stdfuncId: StdFunc | undefined;

    constructor(src: Token, vtype: Vtype, funcInfo: StdFuncInfo, args: Expr[], stdfuncId?: StdFunc) {
        super(ExprKind.STD_FUNC, vtype, src);
        this.funcInfo = funcInfo;
        this.args = args;
        this.stdfuncId = stdfuncId;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        const newArgs: Expr[] = [];
        const types: Vtype[] = [];
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
        let stdfuncId: StdFunc | undefined = undefined;
        for (const sf of this.funcInfo.overloads) {
            if (sf.retArg.inferTypes(retType, ...types).isOk) {
                stdfuncId = sf.stdfuncId;
                break;
            }
        }
        if (stdfuncId === undefined) {
            return Result.err({ msg: `wrong type: ${retType}, ${types}`, src: this.src });
        }
        const expr = new ExprStdFunc(this.src, retType, this.funcInfo, newArgs, stdfuncId);
        return Result.ok({ expr: expr, sideEffect: sideEffect });
    }

    toString(): string {
        if (this.stdfuncId !== undefined) {
            return `StdFunc{ name: ${this.funcInfo.name}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )), stdfuncId: ${StdFunc[this.stdfuncId]} }`;
        } else {
            return `StdFunc{ name: ${this.funcInfo.name}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )), stdfuncId: undefined }`;
        }
    }
}

export class ExprMemberStdFunc extends Expr {
    readonly funcInfo: StdFuncInfo;
    readonly args: Readonly<Expr[]>;
    readonly stdfuncId: StdFunc | undefined;

    constructor(src: Token, vtype: Vtype, funcInfo: StdFuncInfo, args: Expr[], stdfuncId?: StdFunc) {
        super(ExprKind.STD_FUNC, vtype, src);
        this.funcInfo = funcInfo;;
        this.args = args;
        this.stdfuncId = stdfuncId;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        const newArgs: Expr[] = [];
        const types: Vtype[] = [];
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
        let stdfuncId: StdFunc | undefined = undefined;
        for (const sf of this.funcInfo.overloads) {
            if (sf.retArg.inferTypes(retType, ...types).isOk) {
                stdfuncId = sf.stdfuncId;
                break;
            }
        }
        if (stdfuncId === undefined) {
            return Result.err({ msg: `wrong type: ${retType}, ${types}`, src: this.src });
        }
        const expr = new ExprMemberStdFunc(this.src, retType, this.funcInfo, newArgs, stdfuncId);
        return Result.ok({ expr: expr, sideEffect: sideEffect });
    }

    toString(): string {
        if (this.stdfuncId !== undefined) {
            return `MemberStdFunc{ name: ${this.funcInfo.name}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )), stdfuncId: ${StdFunc[this.stdfuncId]} }`;
        } else {
            return `MemberStdFunc{ name: ${this.funcInfo.name}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )), stdfuncId: undefined }`;
        }
    }
}

export class ExprUserFunc extends Expr {
    readonly funcInfo: FuncInfo;
    readonly args: Readonly<Expr[]>;

    constructor(src: Token, funcInfo: FuncInfo, args: Expr[]) {
        super(ExprKind.USER_FUNC, funcInfo.retArg.ret, src);
        this.funcInfo = funcInfo;
        this.args = args;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        const funcInfo = findUserFunc(this.funcInfo.name);
        const newArgs: Expr[] = [];
        const types: Vtype[] = [];
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

    toString(): string {
        return `UserFunc{ name: ${this.funcInfo.name}, definition: ${this.funcInfo.definition}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}


export class ExprMemberUserFunc extends Expr {
    readonly funcInfo: FuncInfo;
    readonly args: Readonly<Expr[]>;

    constructor(src: Token, funcInfo: FuncInfo, args: Expr[]) {
        super(ExprKind.USER_FUNC, funcInfo.retArg.ret, src);
        this.funcInfo = funcInfo;
        this.args = args;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        const funcInfo = findUserFunc(this.funcInfo.name);
        const newArgs: Expr[] = [];
        const types: Vtype[] = [];
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

    toString(): string {
        return `MemberUserFunc{ name: ${this.funcInfo.name}, definition: ${this.funcInfo.definition}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}

export abstract class ExprVar extends Expr {
    readonly nameInfo: NameInfo;
    
    constructor(src: Token, vtype: Vtype, nameInfo: NameInfo) {
        super(ExprKind.VARIABLE, vtype, src);
        this.nameInfo = nameInfo;
    }
}

export class ExprVarVal extends ExprVar {

    constructor(src: Token, nameInfo: NameInfo) {
        super(src, nameInfo.vtype, nameInfo);
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        const expr = new ExprVarVal(this.src, this.nameInfo);
        return Result.ok({ expr: expr, sideEffect: SideEffect.NONE });
    }

    toString(): string {
        return `VarVal{ name: ${this.nameInfo.name}, varId: ${this.nameInfo.varId}, vtype: ${Vtype[this.vtype]} }`;
    }
}

export class ExprArrayVarVal extends ExprVar {
    readonly indexes: Readonly<Expr[]>;

    constructor(src: Token, nameInfo: NameInfo, indexes: Expr[]) {
        super(src, nameInfo.vtype & Vtype.PRIMITIVE_TYPE, nameInfo);
        this.indexes = indexes;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        const newIndexes: Expr[] = [];
        let sideEffect = SideEffect.NONE;
        for (let i = 0; i < this.indexes.length; i++) {
            const indexRes = this.indexes[i].rebuild(findUserFunc);
            if (indexRes.isErr) {
                return indexRes;
            }
            sideEffect |= indexRes.result.sideEffect;
            const index = indexRes.result.expr;
            if (index.vtype !== Vtype.INTEGER) {
                return Result.err({ msg: `${i+1}番目の添え字の型が不正です.`, src: this.src });
            }
            newIndexes.push(index);
        }
        const expr = new ExprArrayVarVal(this.src, this.nameInfo, newIndexes);
        return Result.ok({ expr: expr, sideEffect: sideEffect });
    }

    toString(): string {
        return `ArrayVarVal{ name: ${this.nameInfo.name}, varId: ${this.nameInfo.varId}, vtype: ${Vtype[this.vtype]}, indexes: (( ${this.indexes.map(a => `[[ ${a} ]]`).join(", ") } )) }`;
    }
}

export class ExprArrayRef extends ExprVar {

    constructor(src: Token, nameInfo: NameInfo) {
        super(src, nameInfo.vtype, nameInfo);
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ expr: Expr; sideEffect: SideEffect; }, RebuildError> {
        return Result.ok({ expr: this, sideEffect: SideEffect.NONE });
    }

    toString(): string {
        return `ArrayRef{ name: ${this.nameInfo.name}, vtype: ${Vtype[this.vtype]} }`
    }
}

export enum CodeKind {
    ASSIGN_ARRAY,
    ASSIGN_VAR,
    BLOCK,
    BREAK,
    CALL_STD_FUNC,
    CALL_USER_FUNC,
    CONTINUE,
    DEFINE_USER_FUNC,
    DIM,
    DO_WHILE,
    DRAW_LINE,
    FLUSH,
    FOR,
    GET_POINTER_EVENT,
    IF,
    LET,
    PRINT,
    RANDOMIZE,
    RETURN,
    SET_COLOR
}

export abstract class Code {
    readonly kind: CodeKind;
    readonly src: Readonly<Token[]>;

    constructor(kind: CodeKind, src: Readonly<Token[]>) {
        this.kind = kind;
        this.src = src;
    }

    abstract rebuild(findUserFunc: (name: string) => FuncInfo): Result<{code: Code; sideEffect: SideEffect; },RebuildError>;

    isFinishedWithReturn(): boolean { return false; }
}

export enum BlockEndKind {
    NONE,
    CONTINUE = 1 << 0,
    BREAK    = 1 << 1,
    RETURN   = 1 << 2,
    ALL = CONTINUE | BREAK | RETURN
}

export class BlockInfo {
    readonly src: Readonly<Token[]>;
    readonly id: number;
    readonly parentId: number | undefined;
    readonly varList: Readonly<NameInfo[]>;
    readonly body: Readonly<Code[]>;
    readonly blockEnd: BlockEndKind;

    constructor(src: Readonly<Token[]>, id: number, parentId: number | undefined, varList: Readonly<NameInfo[]>, body: Code[], blockEnd: BlockEndKind) {
        this.src = src;
        this.id = id;
        this.parentId = parentId;
        this.varList = varList;
        this.body = body;
        this.blockEnd = blockEnd;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ blockInfo: BlockInfo; sideEffect: SideEffect; }, RebuildError> {
        const body: Code[] = [];
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

    isFinishedWithReturn(): boolean {
        return this.body.at(-1)?.isFinishedWithReturn() ?? false;
    }

    toString(): string {
        return `BlockInfo{ id: ${this.id}, parentId: ${this.parentId}, varList: [[ ${this.varList.map(s => `${s}`).join(", ")} ]], src: "${Token.lineToString(this.src)}", blockEnd: ${BlockEndKind[this.blockEnd]} }`;
    }
}

export class Block extends Code {
    readonly blockInfo: BlockInfo;

    constructor(blockInfo: BlockInfo) {
        super(CodeKind.BLOCK, blockInfo.src);
        this.blockInfo = blockInfo;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code, sideEffect: SideEffect }, RebuildError> {
        const res = this.blockInfo.rebuild(findUserFunc);
        if (res.isErr) {
            return Result.err(res.error);
        }
        const code = new Block(res.result.blockInfo);
        return Result.ok({ code: code, sideEffect: res.result.sideEffect });
    }

    isFinishedWithReturn(): boolean {
        return this.blockInfo.isFinishedWithReturn();
    }

    toString(): string {
        return `Block{ id: ${this.blockInfo.id}, body: {{ ${this.blockInfo.body.map(s => `[ ${s} ]`).join(", ")} }} }`;
    }
}

export class DefineUserFunc extends Code {
    readonly funcInfo: FuncInfo;
    readonly blockInfo: BlockInfo;

    constructor(funcInfo: FuncInfo, blockInfo: BlockInfo) {
        super(CodeKind.DEFINE_USER_FUNC, funcInfo.src);
        this.funcInfo = funcInfo;
        this.blockInfo = blockInfo;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
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

    toString(): string {
        return `DefineUserFunc{ funcInfo: ${this.funcInfo}, body: {{ ${this.blockInfo.body.map(s => `[ ${s} ]`).join(", ")} }} }`;
    }
}

export class Dim extends Code {
    readonly nameInfo: NameInfo;
    readonly dims: Readonly<number[]>;

    constructor(src: Token[], nameInfo: NameInfo, dims: number[]) {
        super(CodeKind.DIM, src);
        this.nameInfo = nameInfo;
        this.dims = dims;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        return Result.ok({ code: this, sideEffect: SideEffect.NONE });
    }

    toString(): string {
        return `Dim{ name: ${this.nameInfo.name}, vtype: ${Vtype[this.nameInfo.vtype]}, dims: [ ${this.dims} ] }`;
    }
}

export class Let extends Code {
    readonly nameInfo: NameInfo;
    readonly expr: Expr;

    constructor(src: Readonly<Token[]>, nameInfo: NameInfo, expr: Expr) {
        super(CodeKind.LET, src);
        this.nameInfo = nameInfo;
        this.expr = expr;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
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

    toString(): string {
        return `Let{ name: ${this.nameInfo.name}, vtype: ${this.nameInfo.vtype}, expr: (( ${this.expr} ))`;
    }
}

export class AssignVar extends Code {
    readonly op: AssignOpInfo;
    readonly nameInfo: NameInfo;
    readonly expr: Expr;

    constructor(src: Readonly<Token[]>, op: AssignOpInfo, nameInfo: NameInfo, expr: Expr) {
        super(CodeKind.ASSIGN_VAR, src);
        this.op = op;
        this.nameInfo = nameInfo;
        this.expr = expr;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
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

    toString(): string {
        return `AssignVar{ name: ${this.nameInfo.name}, op: "${this.op.op}", expr: (( ${this.expr} )) }`;
    }
}

export class AssignArray extends Code {
    readonly op: AssignOpInfo;
    readonly nameInfo: NameInfo;
    readonly indexes: Readonly<Expr[]>;
    readonly expr: Expr;

    constructor(src: Readonly<Token[]>, op: AssignOpInfo, nameInfo: NameInfo, indexes: Expr[], expr: Expr) {
        super(CodeKind.ASSIGN_ARRAY, src);
        this.op = op;
        this.nameInfo = nameInfo;
        this.indexes = indexes;
        this.expr = expr;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        const newIndexes: Expr[] = [];
        let sideEffect = SideEffect.NONE;
        for (let i = 0; i < this.indexes.length; i++) {
            const indexRes = this.indexes[i].rebuild(findUserFunc);
            if (indexRes.isErr) {
                return Result.err(indexRes.error);
            }
            sideEffect |= indexRes.result.sideEffect;
            const index = indexRes.result.expr;
            if (index.vtype !== Vtype.INTEGER) {
                return Result.err({ msg: `${i+1}番目の添え字の型が不正です.`, src: this.src });
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

    toString(): string {
        return `AssignArray{ name: ${this.nameInfo.name}, op: "${this.op.op}", indexes: (( ${this.indexes.map(e => `[[ ${e} ]]`).join(", ")} )) expr: (( ${this.expr} )) }`;
    }
}

export class If extends Code {
    readonly srcList: Readonly<Readonly<Token[]>[]>;
    readonly testExprList: Readonly<Expr[]>;
    readonly blockInfoList: Readonly<BlockInfo[]>;

    constructor(srcList: Readonly<Readonly<Token[]>[]>, testExprList: Expr[], blockInfoList: BlockInfo[]) {
        super(CodeKind.IF, srcList[0]);
        this.srcList = srcList;
        this.testExprList = testExprList;
        this.blockInfoList = blockInfoList;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        let sideEffect = SideEffect.NONE;
        const newTestExprList: Expr[] = [];
        const newBlockInfoList: BlockInfo[] = [];
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

    isFinishedWithReturn(): boolean {
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

    toString(): string {
        return `If{ [[ ${this.blockInfoList.map( (bi, i) => `testExpr: ${this.testExprList.at(i)}, code: {{ ${bi} }}` ).join(", ")} ]] }`;
    }
}

export class CallStdFunc extends Code {
    readonly funcInfo: StdFuncInfo;
    readonly args: Readonly<Expr[]>;
    readonly stdfuncId: StdFunc | undefined = undefined;

    constructor(src: Readonly<Token[]>, funcInfo: StdFuncInfo, args: Expr[], stdfuncId?: StdFunc) {
        super(CodeKind.CALL_STD_FUNC, src);
        this.funcInfo = funcInfo;
        this.args = args;
        this.stdfuncId = stdfuncId;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        const newArgs: Expr[] = [];
        const types: Vtype[] = [];
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
        let stdfuncId: StdFunc | undefined = undefined;
        for (const sf of this.funcInfo.overloads) {
            if (sf.retArg.inferTypes(sf.retArg.ret, ...types).isOk) {
                stdfuncId = sf.stdfuncId;
                break;
            }
        }
        if (stdfuncId === undefined) {
            return Result.err({ msg: `wrong type: ${types}`, src: this.src });
        }
        const newCode = new CallStdFunc(this.src, this.funcInfo, newArgs, stdfuncId);
        return Result.ok({ code: newCode, sideEffect: sideEffect });
    }

    toString(): string {
        if (this.stdfuncId !== undefined) {
            return `CallStdFunc{ func: ${this.funcInfo.name}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )), stdfuncId: ${StdFunc[this.stdfuncId]} }`;
        } else {
            return `CallStdFunc{ func: ${this.funcInfo.name}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )), stdfuncId: undefined }`;
        }
    }
}

export class CallUserFunc extends Code {
    readonly funcInfo: FuncInfo;
    readonly args: Readonly<Expr[]>;

    constructor(src: Readonly<Token[]>, funcInfo: FuncInfo, args: Expr[]) {
        super(CodeKind.CALL_USER_FUNC, src);
        this.funcInfo = funcInfo;
        this.args = args;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        const funcInfo = findUserFunc(this.funcInfo.name);
        const newArgs: Expr[] = [];
        const types: Vtype[] = [];
        let sideEffect = funcInfo.sideEffect;
        for (let i = 0; i < this.args.length; i++) {
            const argRes = this.args[i].rebuild(findUserFunc);
            if (argRes.isErr) {
                return Result.err(argRes.error);
            }
            sideEffect |= argRes.result.sideEffect;
            const arg = argRes.result.expr;
            newArgs.push(arg)
            types.push(arg.vtype);
        }
        const res = funcInfo.retArg.inferTypes(funcInfo.retArg.ret, ...types);
        if (res.isErr) {
            return Result.err({ msg: res.error, src: this.src });
        }
        const newCode = new CallUserFunc(this.src, funcInfo, newArgs);
        return Result.ok({ code: newCode, sideEffect: sideEffect });
    }

    toString(): string {
        return `CallUserFunc{ func: ${this.funcInfo.name}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}

export class For extends Code {
    readonly loopCounter: NameInfo;
    readonly blockInfo: BlockInfo; // ループブロック.
    readonly initValue: Readonly<{ nameInfo: NameInfo, expr: Expr }>;
    readonly endValue: Readonly<{ nameInfo: NameInfo, expr: Expr }>;
    readonly stepValue: Readonly<{ nameInfo: NameInfo, expr: Expr | null }>;

    constructor(src: Readonly<Token[]>, loopCounter: NameInfo, blockInfo: BlockInfo, initValue: { nameInfo: NameInfo, expr: Expr }, endValue: { nameInfo: NameInfo, expr: Expr }, stepValue: { nameInfo: NameInfo, expr: Expr | null }) {
        super(CodeKind.FOR, src);
        this.loopCounter = loopCounter;
        this.blockInfo = blockInfo;
        this.initValue = initValue;
        this.endValue = endValue;
        this.stepValue = stepValue;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
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
        let stepExpr: Expr | null = null;
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

    toString(): string {
        return `For{ loopCounter: ${ this.loopCounter.name }, init: (( ${ this.initValue.expr } )), end: (( ${ this.endValue.expr } )), step: (( ${this.stepValue.expr} )), code: {{ ${this.blockInfo.body.map(c => `${c}`).join(", ")} }} }`;
    }
}

export class DoWhile extends Code {
    readonly testExpr: Expr;
    readonly blockInfo: BlockInfo; // ループブロック.

    constructor(src: Readonly<Token[]>, testExpr: Expr, blockInfo: BlockInfo) {
        super(CodeKind.DO_WHILE, src);
        this.testExpr = testExpr;
        this.blockInfo = blockInfo;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
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

    toString(): string {
        return `DoWhile{ test: (( ${this.testExpr} )), code: {{ ${this.blockInfo.body.map(c => `${c}`).join(", ")} }} }`;
    }
}

export class Break extends Code {
    readonly blockId: number; // ループブロックID.
    readonly blockSrc: Readonly<Token[]>;

    constructor(src: Token[], blockId: number, blockSrc: Readonly<Token[]>) {
        super(CodeKind.BREAK, src);
        this.blockId = blockId;
        this.blockSrc = blockSrc;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        return Result.ok({ code: this, sideEffect: SideEffect.NONE });
    }

    toString(): string {
        return `Break{ blockId: ${this.blockId}, blockSrc: ${Token.lineToString(this.blockSrc)} }`;
    }
}


export class Continue extends Code {
    readonly blockId: number; // ループブロックID.
    readonly blockSrc: Readonly<Token[]>;

    constructor(src: Token[], blockId: number, blockSrc: Readonly<Token[]>) {
        super(CodeKind.CONTINUE, src);
        this.blockId = blockId;
        this.blockSrc = blockSrc;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        return Result.ok({ code: this, sideEffect: SideEffect.NONE });
    }

    toString(): string {
        return `Continue{ blockId: ${this.blockId}, blockSrc: ${Token.lineToString(this.blockSrc)} }`;
    }
}

export class Return extends Code {
    readonly funcInfo: FuncInfo; // 定義由来のFuncInfoのはず.
    readonly value: Expr | null;

    constructor(src: Readonly<Token[]>, funcInfo: FuncInfo, value?: Expr) {
        super(CodeKind.RETURN, src);
        this.funcInfo = funcInfo;
        if (funcInfo.retArg.ret === Vtype.VOID) {
            U.assert(value === undefined);
            this.value = null;
        } else {
            U.assert(value !== undefined);
            this.value = value;
        }
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
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

    isFinishedWithReturn(): boolean {
        return true;
    }

    toString(): string {
        if (this.value === null) {
            return `Return{ sub: ${this.funcInfo.name} }`;
        } else {
            return `Return{ func: ${this.funcInfo.name}, value: (( ${this.value} )) }`;
        }
    }
}

export class Print extends Code {
    readonly args: Readonly<Expr[]>;

    constructor(src: Readonly<Token[]>, args: Expr[]) {
        super(CodeKind.PRINT, src);
        this.args = args;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        let sideEffect = SideEffect.ACCESS_IO;
        const newArgs: Expr[] = [];
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

    toString(): string {
        return `Print{ args: (( ${this.args.map( a => `[[ ${a} ]]` ).join(", ")} )) }`;
    }
}

export class DrawLine extends Code {
    readonly x1: Expr;
    readonly y1: Expr;
    readonly x2: Expr;
    readonly y2: Expr;

    constructor(src: Readonly<Token[]>, x1: Expr, y1: Expr, x2: Expr, y2: Expr) {
        super(CodeKind.DRAW_LINE, src);
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        const x1Res = this.x1.rebuild(findUserFunc);
        if (x1Res.isErr) {
            return Result.err(x1Res.error);
        }
        const x1 = x1Res.result.expr;
        if (x1.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "X1の型が不正です.", src: x1.src });
        }
        let sideEffect = x1Res.result.sideEffect | SideEffect.ACCESS_IO | SideEffect.CHANGE_RUNNER_STATE;
        const y1Res = this.y1.rebuild(findUserFunc);
        if (y1Res.isErr) {
            return Result.err(y1Res.error);
        }
        const y1 = y1Res.result.expr;
        if (y1.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "Y1の型が不正です.", src: y1.src });
        }
        sideEffect |= y1Res.result.sideEffect;
        const x2Res = this.x2.rebuild(findUserFunc);
        if (x2Res.isErr) {
            return Result.err(x2Res.error);
        }
        const x2 = x2Res.result.expr;
        if (x2.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "X2の型が不正です.", src: x2.src });
        }
        sideEffect |= x2Res.result.sideEffect;
        const y2Res = this.y2.rebuild(findUserFunc);
        if (y2Res.isErr) {
            return Result.err(y2Res.error);
        }
        const y2 = y2Res.result.expr;
        if (y2.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "Y2の型が不正です.", src: y2.src });
        }
        sideEffect |= y2Res.result.sideEffect;
        const code = new DrawLine(this.src, x1, y1, x2, y2);
        return Result.ok({ code: code, sideEffect: sideEffect });
    }

    toString(): string {
        return `DrawLine{ x1: ${this.x1}, y1: ${this.y1}, x2: ${this.x2}, y2: ${this.y2} }`;
    }
}

export class SetColor extends Code {
    readonly red: Expr;
    readonly green: Expr;
    readonly blue: Expr;

    constructor(src: Readonly<Token[]>, red: Expr, green: Expr, blue: Expr) {
        super(CodeKind.SET_COLOR, src);
        this.red = red;
        this.green = green;
        this.blue = blue;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        const redRes = this.red.rebuild(findUserFunc);
        if (redRes.isErr) {
            return Result.err(redRes.error);
        }
        const red = redRes.result.expr;
        let sideEffect = redRes.result.sideEffect | SideEffect.CHANGE_RUNNER_STATE;
        if (red.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "Rの型が不正です.", src: red.src });
        }

        const greenRes = this.green.rebuild(findUserFunc);
        if (greenRes.isErr) {
            return Result.err(greenRes.error);
        }
        const green = greenRes.result.expr;
        sideEffect |= greenRes.result.sideEffect;
        if (green.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "Gの型が不正です.", src: green.src });
        }

        const blueRes = this.blue.rebuild(findUserFunc);
        if (blueRes.isErr) {
            return Result.err(blueRes.error);
        }
        const blue = blueRes.result.expr;
        sideEffect |= blueRes.result.sideEffect;
        if (blue.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "Bの型が不正です.", src: blue.src });
        }

        const code = new SetColor(this.src, red, green, blue);
        return Result.ok({ code: code, sideEffect: sideEffect });
    }

    toString(): string {
        return `SetColor{ R: ${this.red}, G: ${this.green}, B: ${this.blue} }`;
    }
}

export class Randomize extends Code {
    readonly seed: Expr | null;

    constructor(src: Readonly<Token[]>, seed: Expr | null) {
        super(CodeKind.RANDOMIZE, src);
        this.seed = seed;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        if (this.seed === null) {
            return Result.ok( { code: this, sideEffect: SideEffect.CHANGE_RUNNER_STATE });
        }
        const seedRes = this.seed.rebuild(findUserFunc);
        if (seedRes.isErr) {
            return Result.err(seedRes.error);
        }
        const seed = seedRes.result.expr;
        const sideEffect = SideEffect.CHANGE_RUNNER_STATE | seedRes.result.sideEffect;
        if (seed.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "SEEDの型が不正です.", src: seed.src });
        }
        const code = new Randomize(this.src, seed);
        return Result.ok({ code: code, sideEffect: sideEffect });
    }

    toString(): string {
        return `Randomize{ seed: ${this.seed} }`;
    }
}

export class GetPointerEvent extends Code {
    readonly x: NameInfo;
    readonly y: NameInfo;
    readonly eventKind: NameInfo;
    readonly time: NameInfo;
    readonly wait: number;

    constructor(src: Readonly<Token[]>, x: NameInfo, y: NameInfo, eventKind: NameInfo, time: NameInfo, wait: number) {
        super(CodeKind.GET_POINTER_EVENT, src);
        this.x = x;
        this.y = y;
        this.eventKind = eventKind;
        this.time = time;
        this.wait = wait;
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        if (this.x.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "X座標の値を格納する変数の型が不正です.", src: this.src });
        }
        if (this.y.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "Y座標の値を格納する変数の型が不正です.", src: this.src });
        }
        if (this.eventKind.vtype !== Vtype.INTEGER) {
            return Result.err({ msg: "イベントの種類(KIND)を格納する変数の型が不正です.", src: this.src });
        }
        if (this.time.vtype !== Vtype.FLOATING_POINT) {
            return Result.err({ msg: "イベント発生時間(TIME)を格納する変数の型が不正です.", src: this.src });
        }
        return Result.ok({ code: this, sideEffect: SideEffect.ACCESS_IO });
    }

    toString(): string {
        return `GetPointerEvent{ x: ${this.x.name}, y: ${this.y.name}, eventKind: ${this.eventKind.name}, time: ${this.time.name}, wait: ${this.wait} }`;
    }

}

export class Flush extends Code {
    constructor(src: Readonly<Token[]>) {
        super(CodeKind.FLUSH, src);
    }

    rebuild(findUserFunc: (name: string) => FuncInfo): Result<{ code: Code; sideEffect: SideEffect; }, RebuildError> {
        return Result.ok({ code: this, sideEffect: SideEffect.ACCESS_IO });
    }

    toString(): string {
        return `Flush{}`;
    }
}

export default {};
