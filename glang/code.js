//
// Code
// 
import Logger, { LogLevel } from "logger";
const log = new Logger("code", LogLevel.ALL);
import { Token } from "scanner";
import { Result } from "utils";
export var Vtype;
(function (Vtype) {
    Vtype[Vtype["NONE"] = 0] = "NONE";
    Vtype[Vtype["VOID"] = 1] = "VOID";
    Vtype[Vtype["BOOLEAN"] = 2] = "BOOLEAN";
    Vtype[Vtype["INTEGER"] = 4] = "INTEGER";
    Vtype[Vtype["FLOATING_POINT"] = 8] = "FLOATING_POINT";
    Vtype[Vtype["STRING"] = 16] = "STRING";
    Vtype[Vtype["ARRAY"] = 32] = "ARRAY";
    Vtype[Vtype["ARRAY_2D"] = 64] = "ARRAY_2D";
    Vtype[Vtype["ARRAY_3D"] = 96] = "ARRAY_3D";
    Vtype[Vtype["SUB"] = 128] = "SUB";
    Vtype[Vtype["FUNC"] = 256] = "FUNC";
    Vtype[Vtype["REFERENCE"] = 512] = "REFERENCE";
    Vtype[Vtype["INFER"] = 1024] = "INFER";
    Vtype[Vtype["PRIMITIVE_TYPE"] = 30] = "PRIMITIVE_TYPE";
    Vtype[Vtype["NUMBER_TYPE"] = 12] = "NUMBER_TYPE";
    Vtype[Vtype["LOGICAL_TYPE"] = 6] = "LOGICAL_TYPE";
    Vtype[Vtype["COMPARE_TYPE"] = 28] = "COMPARE_TYPE";
    Vtype[Vtype["CONCAT_TYPE"] = 28] = "CONCAT_TYPE";
    Vtype[Vtype["ARRAY_TYPE"] = 96] = "ARRAY_TYPE";
    Vtype[Vtype["BOOL_ARRAY"] = 34] = "BOOL_ARRAY";
    Vtype[Vtype["BOOL_ARRAY_2D"] = 66] = "BOOL_ARRAY_2D";
    Vtype[Vtype["BOOL_ARRAY_3D"] = 98] = "BOOL_ARRAY_3D";
    Vtype[Vtype["INT_ARRAY"] = 36] = "INT_ARRAY";
    Vtype[Vtype["INT_ARRAY_2D"] = 68] = "INT_ARRAY_2D";
    Vtype[Vtype["INT_ARRAY_3D"] = 100] = "INT_ARRAY_3D";
    Vtype[Vtype["FLOAT_ARRAY"] = 40] = "FLOAT_ARRAY";
    Vtype[Vtype["FLOAT_ARRAY_2D"] = 72] = "FLOAT_ARRAY_2D";
    Vtype[Vtype["FLOAT_ARRAY_3D"] = 104] = "FLOAT_ARRAY_3D";
    Vtype[Vtype["STR_ARRAY"] = 48] = "STR_ARRAY";
    Vtype[Vtype["STR_ARRAY_2D"] = 80] = "STR_ARRAY_2D";
    Vtype[Vtype["STR_ARRAY_3D"] = 112] = "STR_ARRAY_3D";
    Vtype[Vtype["INFER_PRIMITIVE"] = 1054] = "INFER_PRIMITIVE";
    Vtype[Vtype["INFER_NUMBER"] = 1036] = "INFER_NUMBER";
    Vtype[Vtype["INFER_LOGICAL"] = 1030] = "INFER_LOGICAL";
    Vtype[Vtype["INFER_COMPARE"] = 1052] = "INFER_COMPARE";
    Vtype[Vtype["INFER_CONCAT"] = 1052] = "INFER_CONCAT";
})(Vtype || (Vtype = {}));
/**
 * 引数のいずれかにINFERが含まれる場合は引数間で整合性のとれるVtypeを返す.
 * 整合性のとれる型が1つに限定される場合はその型を表すVtypeを返し、2つ以上の可能性があるならそれらを組み合わせた上でINFERをつけて返す.
 * 引数にいずれにもINFERが含まれていない場合はすべての引数が完全一致する場合においてのみその型のVtypeを返す.
 * 上記以外の場合はエラー値を返す.
 * INFERは標準関数か演算子にのみ存在する.
 * @param t1
 * @param t2
 * @param t3
 */
export function inferVtype(t1, t2, t3) {
    throw new Error("unimplemented");
}
export class NameInfo {
    src;
    name;
    vtype;
    varId;
    blockId;
    blockVarId;
    constructor(src, name, vtype, varId, blockId, blockVarId) {
        this.src = src;
        this.name = name;
        this.vtype = vtype;
        this.varId = varId;
        this.blockId = blockId;
        this.blockVarId = blockVarId;
    }
    toString() {
        return `NameInfo{ src: "${Token.lineToString(this.src)}", name: ${this.name}, vtype: ${Vtype[this.vtype]}, varId: ${this.varId}, blockId: ${this.blockId}, blockVarId: ${this.blockVarId}  }`;
    }
}
export class FuncRetArg {
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
            if ((this.ret & def.ret) !== def.ret) {
                return Result.err(`戻り値の型が不一致 (this: ${this.ret}, def: ${def.ret})`);
            }
        }
        else if (this.ret !== def.ret) {
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
                    return Result.err(`${i + 1}番目の引数の型が不一致 (this: ${ta}, def: ${da})`);
                }
            }
            else if (ta !== da) {
                return Result.err(`${i + 1}番目の引数の型が不一致 (this: ${ta}, def: ${da})`);
            }
        }
        return Result.ok(hasInfer);
    }
    toString() {
        return `FuncRetArg{ ret: ${Vtype[this.ret]}, args: [${this.args.map(t => Vtype[t])}] }`;
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
    constructor(src, name, retArg, varId, definition) {
        this.src = src;
        this.name = name;
        this.retArg = retArg;
        this.varId = varId;
        if (definition === undefined) {
            this.definition = false;
            this.argNames = undefined;
            this.outerBlockId = undefined;
            this.innerBlockId = undefined;
        }
        else {
            this.definition = true;
            this.argNames = definition.argNames;
            this.outerBlockId = definition.outerBlockId;
            this.innerBlockId = definition.innerBlockId;
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
        return `FuncInfo{ src: ${Token.lineToString(this.src)}, name: ${this.name}, retArg: ${this.retArg}, varId: ${this.varId}, definition: ${this.definition}, argNames: [${this.argNames}], outerBlockId: ${this.outerBlockId}, innerBlockId: ${this.innerBlockId} }`;
    }
}
export class BinaryOpInfo {
    op;
    priority;
    vtype;
    constructor(op, priority, vtype) {
        this.op = op;
        this.priority = priority;
        this.vtype = vtype;
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
    constructor(src, value) {
        super(ExprKind.LITERAL, Vtype.INTEGER, src);
        this.value = value;
    }
    toString() {
        return `LitInt{ value: ${this.value} }`;
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
    toString() {
        return `BinOp{ op: ${this.op}, termL: (${this.termL}), termR: (${this.termR}) }`;
    }
}
export var CodeKind;
(function (CodeKind) {
    CodeKind[CodeKind["BLOCK"] = 0] = "BLOCK";
    CodeKind[CodeKind["DIM"] = 1] = "DIM";
    CodeKind[CodeKind["LET"] = 2] = "LET";
})(CodeKind || (CodeKind = {}));
export class Code {
    kind;
    src;
    constructor(kind, src) {
        this.kind = kind;
        this.src = src;
    }
}
export class Block extends Code {
    id;
    body;
    constructor(src, id, body) {
        super(CodeKind.BLOCK, src);
        this.id = id;
        this.body = body;
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
}
export class Let extends Code {
    nameInfo;
    expr;
    constructor(src, nameInfo, expr) {
        super(CodeKind.LET, src);
        this.nameInfo = nameInfo;
        this.expr = expr;
    }
}
export default {};
