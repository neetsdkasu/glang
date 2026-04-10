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
    ARRAY           = 1 << 5,
    ARRAY_2D        = 2 << 5,  // === (1 << 6)
    ARRAY_3D        = 3 << 5,  // === (1 << 5) | (1 << 6)
    SUB             = 1 << 7,
    FUNC            = 1 << 8,
    REFERENCE       = 1 << 9,
    INFER           = 1 << 10,
    PRIMITIVE_TYPE  = BOOLEAN | INTEGER | FLOATING_POINT | STRING,
    NUMBER_TYPE     = INTEGER | FLOATING_POINT,
    LOGICAL_TYPE    = BOOLEAN | INTEGER,
    COMPARE_TYPE     = NUMBER_TYPE | STRING,
    CONCAT_TYPE     = NUMBER_TYPE | STRING,
    ARRAY_TYPE      = ARRAY | ARRAY_2D | ARRAY_3D,
    BOOL_ARRAY      = BOOLEAN | ARRAY,
    BOOL_ARRAY_2D   = BOOLEAN | ARRAY_2D,
    BOOL_ARRAY_3D   = BOOLEAN | ARRAY_3D,
    INT_ARRAY       = INTEGER | ARRAY,
    INT_ARRAY_2D    = INTEGER | ARRAY_2D,
    INT_ARRAY_3D    = INTEGER | ARRAY_3D,
    FLOAT_ARRAY     = FLOATING_POINT | ARRAY,
    FLOAT_ARRAY_2D  = FLOATING_POINT | ARRAY_2D,
    FLOAT_ARRAY_3D  = FLOATING_POINT | ARRAY_3D,
    STR_ARRAY       = STRING | ARRAY,
    STR_ARRAY_2D    = STRING | ARRAY_2D,
    STR_ARRAY_3D    = STRING | ARRAY_3D,
    INFER_PRIMITIVE = INFER | PRIMITIVE_TYPE,
    INFER_NUMBER    = INFER | NUMBER_TYPE,
    INFER_LOGICAL   = INFER | LOGICAL_TYPE,
    INFER_COMPARE   = INFER | COMPARE_TYPE,
    INFER_CONCAT    = INFER | CONCAT_TYPE
}

export function arrayDimension(vtype: Vtype): number {
    return Math.floor((vtype & Vtype.ARRAY_TYPE) / Vtype.ARRAY);
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
        const t1t2 = ((t1 & t2) | Vtype.INFER) ^ Vtype.INFER;
        const cnt = U.popCount(t1t2);
        if (cnt === 0) {
            return Result.err("型の整合性がとれません.");
        } else if (cnt === 1) {
            return Result.ok(t1t2);
        } else {
            return Result.ok(t1t2 | Vtype.INFER);
        }
    }
    const res = inferVtype(t1, t2);
    if (res.isErr) {
        return res;
    } else {
        return inferVtype(res.result, t3);
    }
}

export class NameInfo {
    readonly src: Readonly<Token[]>;
    readonly name: string;
    readonly vtype: Vtype;
    readonly varId: number;
    readonly blockId: number;
    readonly blockVarId: number;
    constructor(src: Token[], name: string, vtype: Vtype, varId: number, blockId: number, blockVarId: number) {
        this.src = src;
        this.name = name;
        this.vtype = vtype;
        this.varId = varId;
        this.blockId = blockId;
        this.blockVarId = blockVarId;
    }

    toString(): string {
        return `NameInfo{ src: "${Token.lineToString(this.src)}", name: ${this.name}, vtype: ${Vtype[this.vtype]}, varId: ${this.varId}, blockId: ${this.blockId}, blockVarId: ${this.blockVarId}  }`;
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
            if ((this.ret & def.ret) !== def.ret) {
                return Result.err(`戻り値の型が不一致 (this: ${this.ret}, def: ${def.ret})`);
            }
        } else if (this.ret !== def.ret) {
            return Result.err(`戻り値の型が不一致 (this: ${this.ret}, def: ${def.ret})`);
        }
        if (this.args.length !== def.args.length) {
            return Result.err(`引数の数が不一致 (this: ${this.args.length}, def: ${def.args.length})`);
        }
        for (let i = 0; i < this.args.length; i++) {
            const ta = this.args[i];
            const da = def.args[i];
            if (ta & Vtype.INFER) {
                hasInfer = true;
                if ((ta & da) !== da) {
                    return Result.err(`${i+1}番目の引数の型が不一致 (this: ${ta}, def: ${da})`);
                }
            } else if (ta !== da) {
                return Result.err(`${i+1}番目の引数の型が不一致 (this: ${ta}, def: ${da})`);
            }
        }
        return Result.ok(hasInfer);
    }

    toString(): string {
        return `FuncRetArg{ ret: ${Vtype[this.ret]}, args: [[ ${this.args.map(t => Vtype[t])} ]] }`;
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
    readonly op: BinaryOpKind;
    readonly priority: number;
    readonly vtype: Vtype;

    constructor(op: BinaryOpKind, priority: number, vtype: Vtype) {
        this.op = op;
        this.priority = priority;
        this.vtype = vtype;
    }

    toString(): string {
        return `BinOpInfo{ op: ${BinaryOpKind[this.op]}, priority: ${this.priority} }`;
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
    readonly unaryOp: UnaryOpKind | undefined;

    constructor(src: Token, value: number, unaryOp?: UnaryOpKind) {
        super(ExprKind.LITERAL, Vtype.INTEGER, src);
        this.value = value;
        this.unaryOp = unaryOp;
    }

    toString(): string {
        if (this.unaryOp) {
            return `LitInt{ value: ${this.value}, unaryOp: ${UnaryOpKind[this.unaryOp]} }`;
        } else {
            return `LitInt{ value: ${this.value} }`;
        }
    }
}

export class ExprLitFloat extends Expr {
    readonly value: number;
    readonly unaryOp: UnaryOpKind | undefined;

    constructor(src: Token, value: number, unaryOp?: UnaryOpKind) {
        super(ExprKind.LITERAL, Vtype.FLOATING_POINT, src);
        this.value = value;
        this.unaryOp = unaryOp;
    }

    toString(): string {
        if (this.unaryOp) {
            return `LitFloat{ value: ${this.value}, unaryOp: ${UnaryOpKind[this.unaryOp]} }`;
        } else {
            return `LitFloat{ value: ${this.value} }`;
        }
    }
}

export class ExprLitBoolean extends Expr {
    readonly value: boolean;
    readonly unaryOp: UnaryOpKind | undefined;

    constructor(src: Token, value: boolean, unaryOp?: UnaryOpKind) {
        super(ExprKind.LITERAL, Vtype.FLOATING_POINT, src);
        this.value = value;
        this.unaryOp = unaryOp;
    }

    toString(): string {
        if (this.unaryOp) {
            return `LitBoolean{ value: ${this.value}, unaryOp: ${UnaryOpKind[this.unaryOp]} }`;
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

export enum UnaryOpKind {
    POSITIVE_SIGN,  // "+"
    NEGATIVE_SIGN,  // "-"
    BITWISE_NOT,    // "~"
    LOGICAL_NOT     // "!"
}

export class ExprUnaryOp extends Expr {
    readonly op: UnaryOpKind;
    readonly term: Expr;

    constructor(src: Token, vtype: Vtype, op: UnaryOpKind, term: Expr) {
        super(ExprKind.UNARY_OP, vtype, src);
        this.op = op;
        this.term = term;
    }

    toString(): string {
        return `UnaryOp{ op: ${UnaryOpKind[this.op]}, term: [[ ${this.term} ]] }`;
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
        return `BinanyOp{ op: ${this.op}, termL: [[ ${this.termL} ]], termR: [[ ${this.termR} ]] }`;
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
        return `Bracket{ expr: ( ${this.expr} ) }`;
    }
}

export class ExprStdFunc extends Expr {
    readonly name: string;
    readonly retArg: Readonly<FuncRetArg>;
    readonly args: Readonly<Expr[]>;

    constructor(src: Token, vtype: Vtype, name: string, retArg: FuncRetArg, args: Expr[]) {
        super(ExprKind.STD_FUNC, vtype, src);
        this.name = name;
        this.retArg = retArg;
        this.args = args;
    }

    toString(): string {
        return `StdFunc{ name: ${this.name}, vtype: ${Vtype[this.vtype]}, args: (( ${this.args.map(a => `[[ ${a} ]]`).join(", ")} )) }`;
    }
}

export class ExprVar extends Expr {
    readonly nameInfo: NameInfo;

    constructor(src: Token, nameInfo: NameInfo) {
        super(ExprKind.VARIABLE, nameInfo.vtype, src);
        this.nameInfo = nameInfo;
    }

    toString(): string {
        return `Var{ name: ${this.nameInfo.name}, varId: ${this.nameInfo.varId}, vtype: ${Vtype[this.vtype]} }`;
    }
}

export class ExprArrayVar extends Expr {
    readonly nameInfo: NameInfo;
    readonly indexes: Readonly<Expr[]>;

    constructor(src: Token, nameInfo: NameInfo, indexes: Expr[]) {
        super(ExprKind.VARIABLE, nameInfo.vtype, src);
        this.nameInfo = nameInfo;
        this.indexes = indexes;
    }

    toString(): string {
        return `ArrayVar{ name: ${this.nameInfo.name}, varId: ${this.nameInfo.varId}, vtype: ${Vtype[this.vtype]}, indexes: (( ${this.indexes.map(a => `[[ ${a} ]]`).join(", ") } )) }`;
    }

}

export enum CodeKind {
    BLOCK,
    DIM,
    LET,
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
    readonly body: Readonly<Code[]>;

    constructor(src: Token[], id: number, body: Code[]) {
        super(CodeKind.BLOCK, src);
        this.id = id;
        this.body = body;
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
}

export class Let extends Code {
    readonly nameInfo: NameInfo;
    readonly expr: Expr;

    constructor(src: Token[], nameInfo: NameInfo, expr: Expr) {
        super(CodeKind.LET, src);
        this.nameInfo = nameInfo;
        this.expr = expr;
    }
}


export default {};
