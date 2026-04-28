//
// Code
// 
import Logger, { LogLevel } from "logger";
const log = new Logger("code", LogLevel.ALL);

import { Token } from "scanner";
import { Result } from "utils";
import * as U from "utils";

export enum Vtype {
    NONE            = 0,
    VOID            = 1 << 0,
    BOOLEAN         = 1 << 1,
    INTEGER         = 1 << 2,
    FLOATING_POINT  = 1 << 3,
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
    COMPARE_TYPE     = NUMBER_TYPE | STRING,
    CONCAT_TYPE     = NUMBER_TYPE | STRING,
    NON_PRIMITIVE   = ARRAY_TYPE | SUB | FUNC | REFERENCE_VAR,
    BOOL_ARRAY      = BOOLEAN | ARRAY_1D,
    BOOL_ARRAY_2D   = BOOLEAN | ARRAY_2D,
    BOOL_ARRAY_3D   = BOOLEAN | ARRAY_3D,
    INT_ARRAY       = INTEGER | ARRAY_1D,
    INT_ARRAY_2D    = INTEGER | ARRAY_2D,
    INT_ARRAY_3D    = INTEGER | ARRAY_3D,
    FLOAT_ARRAY     = FLOATING_POINT | ARRAY_1D,
    FLOAT_ARRAY_2D  = FLOATING_POINT | ARRAY_2D,
    FLOAT_ARRAY_3D  = FLOATING_POINT | ARRAY_3D,
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
    INFER_ALL       = INFER | PRIMITIVE_TYPE | NON_PRIMITIVE
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
    #vtype: Vtype;
    #count: number = 0;
    #written: number = 0;
    #lastWritten: number = 0;
    #unused: number[] = [];

    constructor(src: Token[], name: string, vtype: Vtype, varId: number, blockId: number, blockVarId: number) {
        this.src = src;
        this.name = name;
        this.#vtype = vtype;
        this.varId = varId;
        this.blockId = blockId;
        this.blockVarId = blockVarId;
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

    /**
     * 変数の型にINFERが含まれている場合で型を特定できるときに呼び出す.
     * @param vtype 特定した型.
     */
    updateType(vtype: Vtype): void {
        const res = inferVtype(vtype, this.#vtype);
        if (res.isErr) {
            log.dump("vtype", vtype);
            log.dump("nameInfo:", this);
            log.error(res.error);
            throw new Error("BUG");
        }
        this.#vtype = res.result;
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
        return `NameInfo{ src: "${Token.lineToString(this.src)}", name: ${this.name}, vtype: ${Vtype[this.vtype]}, varId: ${this.varId}, blockId: ${this.blockId}, blockVarId: ${this.blockVarId}, count: ${this.#count}, written: ${this.written}, unused: ${this.unused.length} }`;
    }
}


export class FuncRetArg {
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
    checkConsistencyWith(def: FuncRetArg): Result<boolean,string> {
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

    toString(): string {
        return `FuncRetArg{ ret: ${Vtype[this.ret]}, args: [[ ${this.args.map(t => Vtype[t])} ]] }`;
    }
}

export class StdFuncInfo {
    readonly name: string;
    readonly retArg: FuncRetArg;
    readonly hasSideEffect: boolean;

    constructor(name: string, retArg: FuncRetArg, hasSideEffect: boolean) {
        this.name = name;
        this.retArg = retArg;
        this.hasSideEffect = hasSideEffect;
    }

    get isFunc(): boolean {
        return this.retArg.ret !== Vtype.VOID;
    }

    get isSub(): boolean {
        return this.retArg.ret === Vtype.VOID;
    }

    toString(): string {
        return `StdFuncInfo{ name: ${this.name}, retArg: ${this.retArg}, hasSideEffect: ${this.hasSideEffect} }`;
    }
}

export class FuncInfo {
    readonly src: Readonly<Token[]>;
    readonly name: string;
    readonly retArg: FuncRetArg;
    readonly varId: number;
    readonly definition: boolean;
    readonly argNames: Readonly<NameInfo[]> | undefined;
    readonly outerBlockId: number | undefined;
    readonly innerBlockId: number | undefined;

    constructor(src: Token[], name: string, retArg: FuncRetArg, varId: number, definition?: { argNames: NameInfo[], outerBlockId: number, innerBlockId: number } | undefined) {
        this.src = src;
        this.name = name;
        this.retArg = retArg;
        this.varId = varId;
        if (definition === undefined) {
            this.definition = false;
            this.argNames = undefined;
            this.outerBlockId = undefined;
            this.innerBlockId = undefined;
        } else {
            this.definition = true;
            this.argNames = definition.argNames;
            this.outerBlockId = definition.outerBlockId;
            this.innerBlockId = definition.innerBlockId;
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
        return `FuncInfo{ src: ${Token.lineToString(this.src)}, name: ${this.name}, retArg: ${this.retArg}, varId: ${this.varId}, definition: ${this.definition}, argNames: [${this.argNames}], outerBlockId: ${this.outerBlockId}, innerBlockId: ${this.innerBlockId} }`;
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
    readonly vtype: Vtype;

    constructor(kind: BinaryOpKind, op: string, priority: number, vtype: Vtype) {
        this.kind = kind;
        this.op = op;
        this.priority = priority;
        this.vtype = vtype;
    }

    toString(): string {
        return `BinOpInfo{ kind: ${BinaryOpKind[this.kind]}, op: ${this.op} priority: ${this.priority} }`;
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

export class Expr {
    readonly kind: ExprKind;
    readonly vtype: Vtype;
    readonly src: Token;

    constructor(kind: ExprKind, vtype: Vtype, src: Token) {
        this.kind = kind;
        this.vtype = vtype;
        this.src = src;
    }
}

export class ExprLitInt extends Expr {
    readonly value: number;
    readonly unaryOp: UnaryOpInfo | undefined;

    constructor(src: Token, value: number, unaryOp?: UnaryOpInfo) {
        super(ExprKind.LITERAL, Vtype.INTEGER, src);
        this.value = value;
        this.unaryOp = unaryOp;
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
    readonly unaryOp: UnaryOpInfo | undefined;

    constructor(src: Token, value: number, unaryOp?: UnaryOpInfo) {
        super(ExprKind.LITERAL, Vtype.FLOATING_POINT, src);
        this.value = value;
        this.unaryOp = unaryOp;
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
    readonly unaryOp: UnaryOpInfo| undefined;

    constructor(src: Token, value: boolean, unaryOp?: UnaryOpInfo) {
        super(ExprKind.LITERAL, Vtype.FLOATING_POINT, src);
        this.value = value;
        this.unaryOp = unaryOp;
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

    toString(): string {
        return `BinanyOp{ op: ${this.op}, vtype: ${Vtype[this.vtype]}, termL: [[ ${this.termL} ]], termR: [[ ${this.termR} ]] }`;
    }
}

export class ExprBracket extends Expr {
    readonly expr: Expr;
    readonly rightBracket: Token;

    constructor(src: Token, expr: Expr, rightBracket: Token) {
        super(ExprKind.BRACKET, expr.vtype, src);
        this.expr = expr;
        this.rightBracket = rightBracket;
    }

    toString(): string {
        return `Bracket{ vtype: ${Vtype[this.vtype]}, expr: ( ${this.expr} ) }`;
    }
}

export class ExprStdFunc extends Expr {
    readonly funcInfo: StdFuncInfo;
    readonly args: Readonly<Expr[]>;

    constructor(src: Token, vtype: Vtype, funcInfo: StdFuncInfo, args: Expr[]) {
        super(ExprKind.STD_FUNC, vtype, src);
        this.funcInfo = funcInfo;
        this.args = args;
    }

    toString(): string {
        return `StdFunc{ name: ${this.funcInfo.name}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}

export class ExprMemberStdFunc extends Expr {
    readonly funcInfo: StdFuncInfo;
    readonly args: Readonly<Expr[]>;

    constructor(src: Token, vtype: Vtype, funcInfo: StdFuncInfo, args: Expr[]) {
        super(ExprKind.STD_FUNC, vtype, src);
        this.funcInfo = funcInfo;;
        this.args = args;
    }

    toString(): string {
        return `MemberStdFunc{ name: ${this.funcInfo.name}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
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

    toString(): string {
        return `MemberUserFunc{ name: ${this.funcInfo.name}, definition: ${this.funcInfo.definition}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}

export class ExprVarVal extends Expr {
    readonly nameInfo: NameInfo;

    constructor(src: Token, nameInfo: NameInfo) {
        super(ExprKind.VARIABLE, nameInfo.vtype, src);
        this.nameInfo = nameInfo;
    }

    toString(): string {
        return `VarVal{ name: ${this.nameInfo.name}, varId: ${this.nameInfo.varId}, vtype: ${Vtype[this.vtype]} }`;
    }
}

export class ExprArrayVarVal extends Expr {
    readonly nameInfo: NameInfo;
    readonly indexes: Readonly<Expr[]>;

    constructor(src: Token, nameInfo: NameInfo, indexes: Expr[]) {
        super(ExprKind.VARIABLE, nameInfo.vtype & Vtype.PRIMITIVE_TYPE, src);
        this.nameInfo = nameInfo;
        this.indexes = indexes;
    }

    toString(): string {
        return `ArrayVarVal{ name: ${this.nameInfo.name}, varId: ${this.nameInfo.varId}, vtype: ${Vtype[this.vtype]}, indexes: (( ${this.indexes.map(a => `[[ ${a} ]]`).join(", ") } )) }`;
    }
}

export class ExprArrayRef extends Expr {
    readonly nameInfo: NameInfo;

    constructor(src: Token, nameInfo: NameInfo) {
        super(ExprKind.VARIABLE, nameInfo.vtype, src);
        this.nameInfo = nameInfo;
    }

    toString(): string {
        return `ArrayRef{ name: ${this.nameInfo.name}, vtype: ${Vtype[this.vtype]} }`
    }
}

export enum CodeKind {
    BLOCK,
    DIM,
    LET,
    ASSIGN_VAR,
    ASSIGN_ARRAY,
}

export class Code {
    readonly kind: CodeKind;
    readonly src: Readonly<Token[]>;

    constructor(kind: CodeKind, src: Token[]) {
        this.kind = kind;
        this.src = src;
    }
}

export class Block extends Code {
    readonly id: number;
    readonly parentId: number | undefined;
    readonly varList: Readonly<NameInfo[]>;
    readonly body: Readonly<Code[]>;

    constructor(src: Token[], id: number, parentId: number | undefined, varList: Readonly<NameInfo[]>, body: Code[]) {
        super(CodeKind.BLOCK, src);
        this.id = id;
        this.parentId = parentId;
        this.varList = varList;
        this.body = body;
    }

    toString(): string {
        return `Block{ id: ${this.id}, body: {{ ${this.body.map(s => `[ ${s} ]`).join(", ")} }} }`;
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

    toString(): string {
        return `Dim{ name: ${this.nameInfo.name}, vtype: ${Vtype[this.nameInfo.vtype]}, dims: [ ${this.dims} ] }`;
    }
}

export class Let extends Code {
    readonly nameInfo: NameInfo;
    readonly expr: Expr;

    constructor(src: Token[], nameInfo: NameInfo, expr: Expr) {
        super(CodeKind.LET, src);
        this.nameInfo = nameInfo;
        this.expr = expr;
    }

    toString(): string {
        return `Let{ name: ${this.nameInfo.name}, vtype: ${this.nameInfo.vtype}, expr: (( ${this.expr} ))`;
    }
}

export class AssignVar extends Code {
    readonly op: AssignOpInfo;
    readonly nameInfo: NameInfo;
    readonly expr: Expr;

    constructor(src: Token[], op: AssignOpInfo, nameInfo: NameInfo, expr: Expr) {
        super(CodeKind.ASSIGN_VAR, src);
        this.op = op;
        this.nameInfo = nameInfo;
        this.expr = expr;
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

    constructor(src: Token[], op: AssignOpInfo, nameInfo: NameInfo, indexes: Expr[], expr: Expr) {
        super(CodeKind.ASSIGN_ARRAY, src);
        this.op = op;
        this.nameInfo = nameInfo;
        this.indexes = indexes;
        this.expr = expr;
    }

    toString(): string {
        return `AssignArray{ name: ${this.nameInfo.name}, op: "${this.op.op}", indexes: (( ${this.indexes.map(e => `[[ ${e} ]]`).join(", ")} )) expr: (( ${this.expr} )) }`;
    }
}


export default {};
