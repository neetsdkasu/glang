//
// Code
// 
import Logger, { LogLevel } from "logger";
const log = new Logger("code", LogLevel.ALL);

import { Token } from "scanner";
import { Result } from "utils";

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

export class NameInfo {
    readonly src: Token[];
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
    readonly args: Vtype[];

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
        return `FuncRetArg{ ret: ${Vtype[this.ret]}, args: [${this.args.map(t => Vtype[t])}] }`;
    }
}

export class FuncInfo {
    readonly src: Token[];
    readonly name: string;
    readonly retArg: FuncRetArg;
    readonly varId: number;
    readonly definition: boolean;
    readonly argNames: NameInfo[] | undefined;
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

export enum ExprKind {
    LITERAL,
    VARIABLE,
    UNARY_OP,
    BINARY_OP,
    STD_FUNC,
    USER_FUNC
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

export class ExprLitNum extends Expr {
    readonly value: number;
    constructor(src: Token, value: number) {
        super(ExprKind.LITERAL, Vtype.INFER_NUMBER, src);
        this.value = value;
    }

    toString(): string {
        return `LitNum{ value: ${this.value} }`;
    }
}





export enum CodeKind {
    BLOCK,
    DIM,
    LET,
}

export class Code {
    readonly kind: CodeKind;
    readonly src: readonly Token[];

    constructor(kind: CodeKind, src: Token[]) {
        this.kind = kind;
        this.src = src;
    }
}

export class Block extends Code {
    readonly id: number;
    readonly body: Code[];

    constructor(src: Token[], id: number, body: Code[]) {
        super(CodeKind.BLOCK, src);
        this.id = id;
        this.body = body;
    }
}

export class Dim extends Code {
    readonly nameInfo: NameInfo;
    readonly dims: readonly number[];

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
