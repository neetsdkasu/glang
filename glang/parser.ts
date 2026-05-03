//
// Parser
//
import Logger, { LogLevel } from "logger";
const log = new Logger("parser", LogLevel.ALL);

import RQueue from "rqueue";
import Scanner, { Token, TokenType } from "scanner";
import { Result, Unimplemented } from "utils";
import * as U from "utils";
import * as C from "code";

/*
古いtscのせいでArray<T>にfindLastメソッドがないのだけど
これを有効にすればArray<T>にfindLastが追加されるぽい？のだけど、コメントアウトして無効にしてる
素直にtscのバージョンをアップデートすることを検討したほうがよさそう
declare global {
    interface Array<T> {
        findLast(callbackFn: (element: T, index: number, array: Array<T>) => boolean, thisArg?: object): T | undefined;
    }
}
*/

function syntaxError<R>(msg: string, obj: any): Result<R,string> {
    return Result.err(`Syntax Error: ${msg} ( ${obj} )`);
}

function boundaryError<R>(msg: string, obj: any): Result<R,string> {
    return Result.err(`Boundary Error: ${msg} ( ${obj} )`);
}

enum Keyword {
    AS = "as",
    BOOLEAN = "boolean",
    BREAK = "break",
    CALL = "call",
    CONTINUE = "continue",
    DIM = "dim",
    DO = "do",
    ELSE = "else",
    END = "end",
    FALSE = "false",
    FLOAT = "float",
    FOR = "for",
    FUNC = "func",
    IF = "if",
    INTEGER = "integer",
    MAIN = "main",
    LET = "let",
    RETURN = "return",
    STEP = "step",
    STRING = "string",
    SUB = "sub",
    THEN = "then",
    TO = "to",
    TRUE = "true",
    WHILE = "while"
}

const ReservedWordSet: Readonly<Set<string>> = Object.freeze(new Set([
    "abstract",
    "alloc",
    "allocation",
    "allocator",
    "and",
    "array",
    Keyword.AS,
    "asm",
    "assemble",
    "async",
    "await",
    "base",
    "bool",
    Keyword.BOOLEAN,
    Keyword.BREAK,
    "byref",
    "byval",
    "case",
    Keyword.CALL,
    "cast",
    "catch",
    "char",
    "character",
    "class",
    "close",
    "cmp",
    "comp",
    "compare",
    "console",
    "const",
    "constant",
    "constructor",
    Keyword.CONTINUE,
    "control",
    "debug",
    "decimal",
    "declare",
    "def",
    "default",
    "defer",
    "define",
    "defined",
    "del",
    "delete",
    "dequeue",
    "destructor",
    "dict",
    Keyword.DIM,
    "div",
    Keyword.DO,
    "double",
    "dump",
    "each",
    Keyword.ELSE,
    "elseif",
    "elsif",
    Keyword.END,
    "enqueue",
    "error",
    "exception",
    "exclude",
    "exit",
    "export",
    "extend",
    "extends",
    "external",
    Keyword.FALSE,
    "field",
    "final",
    "finally",
    Keyword.FLOAT,
    Keyword.FOR,
    "foreach",
    "free",
    "friend",
    "from",
    "fun",
    Keyword.FUNC,
    "function",
    "get",
    "global",
    "go",
    "goto",
    "gosub",
    Keyword.IF,
    "implement",
    "implements",
    "import",
    "in",
    "incude",
    "inf",
    "infer",
    "inferred",
    "infinity",
    "inherit",
    "init",
    "initialize",
    "initialized",
    "input",
    "instance",
    "instanceof",
    "int",
    Keyword.INTEGER,
    "interface",
    "internal",
    "lambda",
    Keyword.LET,
    "local",
    "lock",
    "log",
    "long",
    "loop",
    "macro",
    Keyword.MAIN,
    "map",
    "mapped",
    "match",
    "member",
    "method",
    "mod",
    "module",
    "namespace",
    "nan",
    "new",
    "next",
    "never",
    "nil",
    "not",
    "nothing",
    "null",
    "number",
    "object",
    "of",
    "off",
    "ok",
    "on",
    "open",
    "option",
    "or",
    "out",
    "output",
    "override",
    "overwrite",
    "peek",
    "pop",
    "print",
    "private",
    "proc",
    "process",
    "property",
    "public",
    "push",
    "queue",
    "range",
    "read",
    "readonly",
    "ref",
    "refer",
    "rem",
    "result",
    Keyword.RETURN,
    "sealed",
    "select",
    "self",
    "set",
    "short",
    "single",
    "some",
    "sort",
    "stack",
    Keyword.STEP,
    Keyword.STRING,
    "sturct",
    Keyword.SUB,
    "super",
    "switch",
    "sync",
    "synchronized",
    "template",
    Keyword.THEN,
    "this",
    "throw",
    "throws",
    Keyword.TO,
    Keyword.TRUE,
    "try",
    "type",
    "typeof",
    "undefined",
    "unknown",
    "unlock",
    "until",
    "use",
    "using",
    "val",
    "var",
    "void",
    "volatile",
    "wend",
    "where",
    Keyword.WHILE,
    "write",
    "xor",
    "yield"
]));


/**
 * 標準関数
 */
const StdFuncWordMap: Readonly<Map<string,C.StdFuncInfo>> = Object.freeze(new Map([
    new C.StdFuncInfo("cbool", new C.RetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_PRIMITIVE]), false),
    new C.StdFuncInfo("cfloat", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.INFER_PRIMITIVE]), false),
    new C.StdFuncInfo("cint", new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INFER_PRIMITIVE]), false),
    new C.StdFuncInfo("cstr", new C.RetArg(C.Vtype.STRING, [C.Vtype.INFER_PRIMITIVE]), false),
    new C.StdFuncInfo("abs", new C.RetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER]), false),
    new C.StdFuncInfo("sign", new C.RetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER]), false),
    new C.StdFuncInfo("max", new C.RetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER,C.Vtype.INFER_NUMBER]), false),
    new C.StdFuncInfo("min", new C.RetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER,C.Vtype.INFER_NUMBER]), false),
    new C.StdFuncInfo("cos", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), false),
    new C.StdFuncInfo("sin",  new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), false),
    new C.StdFuncInfo("tan", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), false),
    new C.StdFuncInfo("pow", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT,C.Vtype.FLOATING_POINT]), false),
    new C.StdFuncInfo("sqrt", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), false),
    new C.StdFuncInfo("floor", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), false),
    new C.StdFuncInfo("ceil", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), false),
    new C.StdFuncInfo("size", new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INFER_ARRAY, C.Vtype.INTEGER]), false),
    new C.StdFuncInfo("sel", new C.RetArg(C.Vtype.INFER_PRIMITIVE, [C.Vtype.BOOLEAN, C.Vtype.INFER_PRIMITIVE, C.Vtype.INFER_PRIMITIVE]), false)
].map( fi => [fi.name, fi] )));

enum Symbols {
    ASSIGN_OP = "=",
    COMMA = ",",
    LEFT_ROUND_BRACKET = "(",
    RIGHT_ROUND_BRACKET = ")",
    ARGLIST_DELIMITER = COMMA,
    ARGLIST_BEGIN = LEFT_ROUND_BRACKET,
    ARGLIST_END = RIGHT_ROUND_BRACKET,
    DIMLIST_DELIMITER = COMMA,
    DIMLIST_BEGIN = LEFT_ROUND_BRACKET,
    DIMLIST_END = RIGHT_ROUND_BRACKET,
    MEMBER_ACCESS_OP = "."
}

const UnaryOpMap: Readonly<Map<string,C.UnaryOpInfo>> = Object.freeze(new Map([
    new C.UnaryOpInfo(C.UnaryOpKind.POSITIVE_SIGN, "+", C.Vtype.INFER_NUMBER),
    new C.UnaryOpInfo(C.UnaryOpKind.NEGATIVE_SIGN, "-", C.Vtype.INFER_NUMBER),
    new C.UnaryOpInfo(C.UnaryOpKind.BITWISE_NOT,   "~", C.Vtype.INTEGER),
    new C.UnaryOpInfo(C.UnaryOpKind.LOGICAL_NOT,   "!", C.Vtype.BOOLEAN)
].map( oi => [oi.op, oi] )));

const BinaryOpMap: Readonly<Map<string,C.BinaryOpInfo>> = Object.freeze(new Map([
    new C.BinaryOpInfo(C.BinaryOpKind.MULTIPLY,         "*",  100, new C.RetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER, C.Vtype.INFER_NUMBER])),
    new C.BinaryOpInfo(C.BinaryOpKind.DIVIDE,           "/",  100, new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT,C.Vtype.FLOATING_POINT])),
    new C.BinaryOpInfo(C.BinaryOpKind.INT_DIVIDE,       "\\", 100, new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INTEGER, C.Vtype.INTEGER])),
    new C.BinaryOpInfo(C.BinaryOpKind.INT_REMINDER,     "%",  100, new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INTEGER, C.Vtype.INTEGER])),
    new C.BinaryOpInfo(C.BinaryOpKind.ADD,              "+",   90, new C.RetArg(C.Vtype.INFER_CONCAT, [C.Vtype.INFER_CONCAT, C.Vtype.INFER_CONCAT])),
    new C.BinaryOpInfo(C.BinaryOpKind.SUBTRACT,         "-",   90, new C.RetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER, C.Vtype.INFER_NUMBER])),
    new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_ASHIFT_R, ">>",  80, new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INTEGER, C.Vtype.INTEGER])),
    new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_ASHIFT_L, "<<",  80, new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INTEGER, C.Vtype.INTEGER])),
    new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_LSHIFT_R, ">>>", 80, new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INTEGER, C.Vtype.INTEGER])),
    new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_LSHIFT_L, "<<<", 80, new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INTEGER, C.Vtype.INTEGER])),
    new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_AND,      "&",   70, new C.RetArg(C.Vtype.INFER_LOGICAL, [C.Vtype.INFER_LOGICAL, C.Vtype.INFER_LOGICAL])),
    new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_OR,       "|",   60, new C.RetArg(C.Vtype.INFER_LOGICAL, [C.Vtype.INFER_LOGICAL, C.Vtype.INFER_LOGICAL])),
    new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_XOR,      "^",   50, new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INTEGER, C.Vtype.INTEGER])),
    new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_EQ,       "==",  40, new C.RetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_PRIMITIVE, C.Vtype.INFER_PRIMITIVE])),
    new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_NE,       "!=",  40, new C.RetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_PRIMITIVE, C.Vtype.INFER_PRIMITIVE])),
    new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_GT,       ">",   40, new C.RetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_COMPARE, C.Vtype.INFER_COMPARE])),
    new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_GE,       ">=",  40, new C.RetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_COMPARE, C.Vtype.INFER_COMPARE])),
    new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_LT,       "<",   40, new C.RetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_COMPARE, C.Vtype.INFER_COMPARE])),
    new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_LE,       "<=",  40, new C.RetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_COMPARE, C.Vtype.INFER_COMPARE])),
    new C.BinaryOpInfo(C.BinaryOpKind.SHORTCIRCUIT_AND, "&&",  30, new C.RetArg(C.Vtype.BOOLEAN, [C.Vtype.BOOLEAN, C.Vtype.BOOLEAN])),
    new C.BinaryOpInfo(C.BinaryOpKind.SHORTCIRGUIT_OR,  "||",  20, new C.RetArg(C.Vtype.BOOLEAN, [C.Vtype.BOOLEAN, C.Vtype.BOOLEAN]))
].map( oi => [oi.op, oi] )));

const AssignOpMap: Readonly<Map<string,C.AssignOpInfo>> = Object.freeze(new Map([
    new C.AssignOpInfo(C.AssignKind.ASSIGN,           Symbols.ASSIGN_OP, C.Vtype.INFER_PRIMITIVE),
    new C.AssignOpInfo(C.AssignKind.ADD,              "+=",   C.Vtype.INFER_CONCAT),
    new C.AssignOpInfo(C.AssignKind.SUBTRACT,         "-=",   C.Vtype.INFER_NUMBER),
    new C.AssignOpInfo(C.AssignKind.MULTIPLY,         "*=",   C.Vtype.INFER_NUMBER),
    new C.AssignOpInfo(C.AssignKind.DIVIDE,           "/=",   C.Vtype.FLOATING_POINT),
    new C.AssignOpInfo(C.AssignKind.INT_DIVIDE,       "\\=",  C.Vtype.INTEGER),
    new C.AssignOpInfo(C.AssignKind.INT_REMINDER,     "%=",   C.Vtype.INTEGER),
    new C.AssignOpInfo(C.AssignKind.BITWISE_ASHIFT_R, ">>=",  C.Vtype.INTEGER),
    new C.AssignOpInfo(C.AssignKind.BITWISE_ASHIFT_L, "<<=",  C.Vtype.INTEGER),
    new C.AssignOpInfo(C.AssignKind.BITWISE_LSHIFT_R, ">>>=", C.Vtype.INTEGER),
    new C.AssignOpInfo(C.AssignKind.BITWISE_LSHIFT_L, "<<<=", C.Vtype.INTEGER),
    new C.AssignOpInfo(C.AssignKind.BITWISE_AND,      "&=",   C.Vtype.INFER_LOGICAL),
    new C.AssignOpInfo(C.AssignKind.BITWISE_OR,       "|=",   C.Vtype.INFER_LOGICAL),
    new C.AssignOpInfo(C.AssignKind.BITWISE_XOR,      "^=",   C.Vtype.INFER_LOGICAL)
].map( oi => [oi.op, oi] )));

const POSITIVE_INTEGER_BOUND = BigInt(0x7FFFFFFF);
const NEGATIVE_INTEGER_BOUND = BigInt(2 ** 31);

log.dump("POSITIVE_INTEGER_BOUND", POSITIVE_INTEGER_BOUND);
log.dump("NEGATIVE_INTEGER_BOUND", NEGATIVE_INTEGER_BOUND);

function parseNumber(token: Token, unaryOp?: C.UnaryOpKind): Result<number,string> {
    switch (token.tokenType) {
        case TokenType.INTEGER:
        case TokenType.BIN_INETGER:
        case TokenType.HEX_INTEGER:
            const bi = BigInt(token.value);
            if (unaryOp === C.UnaryOpKind.NEGATIVE_SIGN) {
                if (bi > NEGATIVE_INTEGER_BOUND) {
                    return boundaryError("32bit符号付整数(2の補数表現)の下限を超えています.", token);
                }
                return Result.ok(Number(-bi));
            } else if (bi > POSITIVE_INTEGER_BOUND) {
                return boundaryError("32bit符号付整数(2の補数表現)の上限を超えています.", token);
            } else if (unaryOp === C.UnaryOpKind.BITWISE_NOT) {
                return Result.ok(Number(bi) ^ 0xFFFFFFFF);
            } else if (unaryOp === C.UnaryOpKind.POSITIVE_SIGN || unaryOp === undefined) {
                return Result.ok(Number(bi));
            } else {
                throw new Error(`BUG: 整数に適用できない単項演算子. ( ${C.UnaryOpKind[unaryOp]} )`);
            }
        case TokenType.FLOATING_POINT:
            const fp = parseFloat(token.value);
            if (unaryOp === C.UnaryOpKind.NEGATIVE_SIGN) {
                return Result.ok(-fp);
            } else if (unaryOp === C.UnaryOpKind.POSITIVE_SIGN || unaryOp === undefined) {
                return Result.ok(fp);
            } else {
                throw new Error(`BUG: 浮動小数点数に適用できない単項演算子. ( ${C.UnaryOpKind[unaryOp]} )`);
            }
        default:
            throw new Error(`BUG: 数値ではないトークン. ( ${token} )`);
    }
}

class NameMap {
    readonly blockId: number;
    readonly blockSrc: Token[] | null;
    readonly #map: Map<string, C.NameInfo> = new Map();

    constructor(blockId: number, blockSrc: Token[] | null) {
        this.blockId = blockId;
        this.blockSrc = blockSrc;
    }

    #newBlockVarId(): number {
        return this.#map.size;
    }

    has(name: string): boolean {
        return this.#map.has(name);
    }

    set(src: Token[], name: string, vtype: C.Vtype, varId: number): C.NameInfo {
        const nameInfo = new C.NameInfo(src, name, vtype, varId, this.blockId, this.#newBlockVarId());
        this.#map.set(name, nameInfo);
        return nameInfo;
    }

    get(name: string): C.NameInfo | undefined {
        return this.#map.get(name);
    }

    getNameList(): Readonly<C.NameInfo[]> {
        return [...this.#map.values()].sort( (a, b) => a.blockVarId - b.blockVarId );
    }
}


class Env {
    #nameMapStack: NameMap[] = []; // ブロックネストの各ブロックに束縛される名前を管理します(トップレベルのブロックにはユーザ関数名も配置します).
    #codeBodyStack: C.Code[][] = []; // ブロックネストの各ブロックに置かれるコードリストを管理します.
    #totalBlockCount: number = 0; // ユニークなブロックIDを生成するために使用します.
    #totalVarCount: number = 0; // ユニークな変数IDを生成するために使用します.
    #userFuncMap: Map<string,C.FuncInfo[]> = new Map(); // ユーザ関数の情報を管理します.
    #uniqueNameMap: Map<string,Token[]> = new Map(); // ユーザ関数名と同名の変数が関数定義前に指定されていることを検出する目的に使用されます.

    constructor() {}

    reset(): void {
        this.#totalBlockCount = 0;
        this.#nameMapStack = [];
        this.#codeBodyStack = [];
        this.#totalVarCount = 0;
        this.#userFuncMap.clear();
        this.#uniqueNameMap.clear();
    }

    get isToplevel(): boolean {
        return this.#nameMapStack.length === 1;
    }

    #newBlockId(): number {
        return this.#totalBlockCount++;
    }

    #newVarId(): number {
        return this.#totalVarCount++;
    }

    /**
     * 変数名などを束縛するブロックをブロックネスト最深部に追加します.
     * 
     * @param blockSrc ブロックを構築するソースコード情報(func/sub/for/if/elseなど). トップレベルのみnull.
     */
    push(blockSrc: Token[] | null): number {
        log.info("new block");
        log.dump("block src", Token.lineToString, blockSrc ?? []);
        const blockId = this.#newBlockId();
        this.#nameMapStack.push(new NameMap(blockId, blockSrc));
        this.#codeBodyStack.push([]);
        return blockId;
    }

    /**
     * 最深ブロックを取り除きます.
     * 
     * @returns 
     */
    pop(): Result<C.BlockInfo,string> {
        log.info("drop block");
        if (this.#codeBodyStack.length === 0) {
            return Result.err("no block");
        }

        const map = this.#nameMapStack.pop()!;

        const src = map.blockSrc ?? [];
        const id = map.blockId;
        const parentId = this.#nameMapStack.at(-1)?.blockId;
        const varList = map.getNameList();
        const body = this.#codeBodyStack.pop()!;

        const blockInfo = new C.BlockInfo(src, id, parentId, varList, body);

        log.dump("block src", Token.lineToString, src);

        return Result.ok(blockInfo);
    }

    /**
     * sub/func/dim/letで指定された名前を最深ブロックに登録します.
     * 指定された名前に問題がある場合に限りResult.errを返します.
     * 
     * @param src 
     * @param name 
     * @param vtype 
     * @returns 
     */
    addName(src: Token[], name: string, vtype: C.Vtype): Result<C.NameInfo,string> {
        log.info("add name");
        name = name.toLowerCase();
        if (ReservedWordSet.has(name)) {
            return syntaxError(`名前に予約語は使用できません. "${name}"`, src);
        }
        if (StdFuncWordMap.has(name)) {
            return syntaxError(`名前に標準関数名は使用できません. "${name}"`, src);
        }
        for (let i = 1; i <= this.#nameMapStack.length; i++) {
            const nameMap = this.#nameMapStack.at(-i)!;
            if (nameMap.has(name)) {
                const info = nameMap.get(name)!;
                if (info.vtype === C.Vtype.SUB || info.vtype === C.Vtype.FUNC) {
                    return syntaxError(`ユーザ関数名との名前の重複はできません(シャドーイングはできない仕様です)."${name}"`, src);
                } else {
                    return syntaxError(`ブロックネストのチェーン内で他の名前と重複はできません(シャドーイングはできない仕様です)."${name}"`, src);
                }
            }
        }
        if (!this.#uniqueNameMap.has(name)) {
            this.#uniqueNameMap.set(name, src);
        }
        const current = this.#nameMapStack.at(-1)!;
        const nameInfo = current.set(src, name, vtype, this.#newVarId());
        log.dump("added name", name);
        return Result.ok(nameInfo);
    }

    /**
     * 最深ブロックからトップレベルブロックまでに指定した名前で登録されているならその情報を取得します.
     * 
     * @param name 
     * @returns 
     */
    findName(name: string): C.NameInfo | undefined {
        name = name.toLowerCase();
        for (let i = 1; i <= this.#nameMapStack.length; i++) {
            const nameMap = this.#nameMapStack.at(-i)!;
            if (nameMap.has(name)) {
                return nameMap.get(name);
            }
        }
        return undefined;
    }

    /**
     * 最深ブロックからトップレベルブロックまでに指定した名前が登録されているか確認します.
     * 
     * @param name 
     * @returns 
     */
    hasName(name: string): boolean {
        name = name.toLowerCase();
        for (let i = 1; i <= this.#nameMapStack.length; i++) {
            const nameMap = this.#nameMapStack.at(-i)!;
            if (nameMap.has(name)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 最深ブロックのコードリスト末尾にコードを追加します.
     * 
     * @param code 
     */
    addCode(code: C.Code): void {
        this.#codeBodyStack.at(-1)!.push(code);
    }

    /**
     * 指定した名前のユーザ関数に関する情報を取得します.
     * 
     * @param name 
     * @returns 
     */
    findUserFunc(name: string): readonly C.FuncInfo[] | undefined {
        name = name.toLowerCase();
        return this.#userFuncMap.get(name);
    }

    /**
     * ユーザ関数の情報を登録します.
     * ユーザ関数定義(func/sub)のほか、関数定義前に式中で使用されたユーザ関数(らしき名前)もここで登録します.
     * 
     * @param src 
     * @param name 
     * @param retArg 
     * @param definition 
     * @param argNames 仮引数名のリスト.関数定義の場合は必須.関数呼び出しの場合は省略またｈundefinedを渡す必要があります.
     * @returns 
     */
    addUserFunc(src: Token[], name: string, retArg: C.RetArg, definition: boolean, argNames?: string[] | undefined): Result<C.FuncInfo,string> {
        log.info("add func");
        name = name.toLowerCase();
        if (ReservedWordSet.has(name)) {
            if (name !== Keyword.MAIN) {
                return syntaxError(`ユーザ関数名に予約語は使用できません. "${name}"`, src);
            } else if (retArg.checkConsistencyWith(new C.RetArg(C.Vtype.VOID, [])).isErr) {
                if (definition) {
                    return syntaxError(`${Keyword.MAIN}関数は"${Keyword.SUB} ${Keyword.MAIN}${Symbols.ARGLIST_BEGIN}${Symbols.ARGLIST_END}"で定義される必要があります.`, src);
                } else {
                    return syntaxError(`${Keyword.MAIN}関数は"${Keyword.CALL} ${Keyword.MAIN}${Symbols.ARGLIST_BEGIN}${Symbols.ARGLIST_END}"で呼び出させれる必要があります.`, src);
                }
            }
        }
        if (StdFuncWordMap.has(name)) {
            return syntaxError(`ユーザ関数名に標準関数名は使用できません. "${name}"`, src);
        }
        if (this.#uniqueNameMap.has(name)) {
            const dup = this.#uniqueNameMap.get(name)!;
            return syntaxError(`ユーザ関数名との名前の重複はできません(シャドーイングはできない仕様です)."${name}"`, dup);
        }
        if (definition) {
            if (argNames === undefined) {
                throw new Error("BUG");
            }
            if (retArg.args.length !== argNames.length) {
                throw new Error("BUG");
            }
            const dup: Set<string> = new Set();
            for (let argName of argNames) {
                argName = argName.toLowerCase();
                if (ReservedWordSet.has(argName)) {
                    return syntaxError(`仮引数名に予約語は使用できません. "${argName}"`, src);
                }
                if (StdFuncWordMap.has(argName)) {
                    return syntaxError(`仮引数名に標準関数名は使用できません. "${argName}"`, src);
                }
                if (this.hasName(argName) || argName === name) {
                    return syntaxError(`仮引数名にグローバル変数名やユーザ関数名は使用できません. "${argName}"`, src);
                }
                if (dup.has(argName)) {
                    return syntaxError(`仮引数名が重複しています. "${argName}"`, src);
                }
                dup.add(argName);
            }
        }
        let varId: number;
        const varInfo = this.#nameMapStack.at(0)?.get(name);
        if (varInfo) {
            if (varInfo.vtype !== C.Vtype.SUB && varInfo.vtype !== C.Vtype.FUNC) {
                // #uniqueNameMapのとこで弾かれているはず.
                log.error("varInfo", varInfo);
                throw new Error("BUG: グローバル変数名でユーザ関数名が使用されています.");
            }
            varId = varInfo.varId;
        } else {
            const vtype = retArg.ret === C.Vtype.VOID ? C.Vtype.SUB : C.Vtype.FUNC;
            varId = this.#newVarId();
            this.#nameMapStack.at(0)!.set(src, name, vtype, varId);
        }
        let argNameAndBlockIds: { argNames: C.NameInfo[], outerBlockId: number, innerBlockId: number} | undefined = undefined;
        if (definition) {
            const outerBlockId = this.push(src);
            const args: C.NameInfo[] = [];
            for (let i = 0; i < argNames!.length; i++) {
                const argRes = this.addName(src, argNames![i], retArg.args[i]);
                if (argRes.isErr) {
                    return Result.err(argRes.error);
                }
                args.push(argRes.result);
            }
            const innerBlockId = this.push(src);
            argNameAndBlockIds = {
                argNames: args,
                outerBlockId: outerBlockId,
                innerBlockId: innerBlockId
            };
        }
        const funcInfo = new C.FuncInfo(src, name, retArg, varId, argNameAndBlockIds);
        const funcList = this.#userFuncMap.get(name);
        if (funcList) {
            let defined = false;
            for (const current of funcList) {
                defined ||= current.definition;
                if (current.definition && definition) {
                    return syntaxError(`すでに存在するユーザ関数名です.ユーザ関数定義が重複しています. "${name}"`, src);
                }
                if (current.definition !== definition) {
                    // どちらかが関数定義の場合にのみ検証します.
                    // 想定ではcurrentが関数定義前に式中に現れたユーザ関数名の情報になります.
                    const validation = current.validate(funcInfo);
                    if (validation.isErr) {
                        return syntaxError(validation.error, definition ? current.src : src);
                    }
                }
            }
            if (definition) {
                this.#userFuncMap.set(name, [funcInfo]);
            } else if (!defined) {
                funcList.push(funcInfo);
            }
        } else {
            this.#userFuncMap.set(name, [funcInfo]);
        }
        log.dump("added func", name);
        return Result.ok(funcInfo);
    }
}

export class Parser {
    readonly #scanner: Scanner;
    readonly #env: Env = new Env();

    constructor(scanner: Scanner) {
        this.#scanner = scanner;
    }

    /**
     * 一行分トークンを読み込む.
     * @returns 1個以上のトークンを含むことが保証されるRQueue.末尾のトークンはEOLかEOF.
     */
    #scanLine(): Result<RQueue<Token>,string> {
        const line: Token[] = [];
        for (;;)  {
            const res = this.#scanner.scan();
            if (res.isErr) {
                return Result.err(res.error);
            }
            const token = this.#scanner.token!;
            line.push(token);
            if (!res.result || token.tokenType === TokenType.EOL || token.tokenType === TokenType.EOF) {
                break;
            }
        }
        return Result.ok(RQueue.wrap(line));
    }

    parse(): Result<C.BlockInfo,string> {
        this.#env.reset();
        this.#env.push(null);

        for (;;) {
            const lineRes = this.#scanLine();
            if (lineRes.isErr) {
                return Result.err(lineRes.error);
            }
            const line = lineRes.result;

            const cmdToken = line.front!;

            log.dump("cmdToken", cmdToken);

            if (cmdToken.tokenType === TokenType.EOF) {
                break;
            }
            if (cmdToken.tokenType === TokenType.EOL) {
                continue;
            }
            if (cmdToken.tokenType !== TokenType.WORD) {
                return syntaxError("行頭に使用できない文字/文字列です.", cmdToken);
            }

            let res: Result<undefined,string>;

            const cmd = cmdToken.value.toLowerCase();

            switch (cmd) {
                case Keyword.DIM:
                    res = this.#parseDim(line);
                    break;
                case Keyword.LET:
                    res = this.#parseLet(line);
                    break;
                case Keyword.SUB:
                    res = this.#parseSub(line);
                    break;
                case Keyword.FUNC:
                    throw new Unimplemented(line.front);
                default:
                    return syntaxError(`トップレベルで"${cmdToken.value}"から行頭の開始はできません.`, cmdToken);
            }

            if (res.isErr) {
                return Result.err(res.error);
            }
        }

        const mainSub = this.#env.findUserFunc(Keyword.MAIN);
        if (mainSub === undefined || !mainSub[0].definition) {
            return Result.err(`${Keyword.MAIN}関数を定義する必要があります.`)
        }

        if (!this.#env.isToplevel) {
            // ブロックが閉じておらずendが足りてない
            throw new Unimplemented();
        }

        log.info("all done.");

        return this.#env.pop();
    }

    /**
     * endかelseで始まる行に到達するまでコードを読み込む.
     */
    #parseCodeBlock(): Result<{ lastLine: RQueue<Token> },string> {
        log.info("parse block...");
        
        for (;;) {
            const lineRes = this.#scanLine();
            if (lineRes.isErr) {
                return Result.err(lineRes.error);
            }
            const line = lineRes.result;

            const cmdToken = line.front!;

            log.dump("cmdToken", cmdToken);

            if (cmdToken.tokenType === TokenType.EOF) {
                return syntaxError(`キーワード"${Keyword.END}"でブロックを閉じる必要があります.`, cmdToken);
            }
            if (cmdToken.tokenType === TokenType.EOL) {
                continue;
            }
            if (cmdToken.tokenType !== TokenType.WORD) {
                return syntaxError("行頭に使用できない文字/文字列です.", cmdToken);
            }

            let res: Result<undefined,string>;

            const cmd = cmdToken.value.toLowerCase();

            switch (cmd) {
                case Keyword.ELSE:
                case Keyword.END:
                    log.info("parsed block.");
                    return Result.ok({ lastLine: line });
                case Keyword.SUB:
                case Keyword.FUNC:
                    return syntaxError("ブロック内でユーザ関数の定義はできません.", cmdToken);
                case Keyword.DIM:
                    res = this.#parseDim(line);
                    break;
                case Keyword.FOR:
                    res = this.#parseFor(line);
                    break;
                case Keyword.LET:
                    res = this.#parseLet(line);
                    break;
                case Keyword.IF:
                    res = this.#parseIf(line);
                    break;
                case Keyword.CALL:
                case Keyword.RETURN:
                case Keyword.DO:
                    throw new Unimplemented(line.front);
                default:
                    const nameInfo = this.#env.findName(cmd);
                    if (nameInfo !== undefined) {
                        if (nameInfo.vtype & C.Vtype.REFERENCE_VAR) {
                            throw new Unimplemented(line.front);
                        } else if (nameInfo.vtype & C.Vtype.ARRAY_TYPE) {
                            res = this.#parseAssignArray(line);
                            break;
                        } else if (nameInfo.vtype & C.Vtype.PRIMITIVE_TYPE) {
                            res = this.#parseAssign(line);
                            break;
                        }
                    }
                    return syntaxError(`"${cmdToken.value}"から行頭の開始はできません.`, cmdToken);
            }

            if (res.isErr) {
                return Result.err(res.error);
            }
        }

        // Unreachable
    }

    #parseDim(line: RQueue<Token>): Result<undefined,string> {
        const dimToken = line.dequeue()!;
        const src: Token[] = [dimToken];

        log.info("parse dim...");

        const arrNameToken = line.dequeue()!;
        src.push(arrNameToken);
        
        const arrName = arrNameToken.value.toLowerCase();

        log.dump("arrName", arrName);

        if (arrNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("配列名が必要です.", arrNameToken);
        }

        const lrbToken = line.dequeue()!;
        src.push(lrbToken);

        if (lrbToken.value !== Symbols.DIMLIST_BEGIN) {
            return syntaxError(`配列の次元サイズ指定を開始するための記号 ${Symbols.DIMLIST_BEGIN} が必要です.`,lrbToken);
        }

        let dims: number[] = [];
        let dm: number = 1;

        while (line.len) {
            const sizeToken = line.dequeue()!;
            src.push(sizeToken);

            switch (sizeToken.tokenType) {
                case TokenType.INTEGER:
                case TokenType.BIN_INETGER:
                case TokenType.HEX_INTEGER:
                    const numRes = parseNumber(sizeToken);
                    if (numRes.isErr) {
                        return Result.err(numRes.error);
                    }
                    const d = numRes.result;

                    log.dump(`d[${dims.length+1}]`, d);
                    
                    if (d === 0) {
                        return boundaryError("配列の次元サイズに0を指定はできません.", sizeToken);
                    }
                    dm *= d;
                    if (dm > 1e6) {
                        return boundaryError("配列の次元サイズの積が1000001以下になるように次元サイズを指定してください. ", sizeToken);
                    }

                    dims.push(d);
                    break;
                default:
                    return syntaxError("正の整数リテラルによる次元サイズ指定が必要です.", sizeToken);
            }

            const symToken = line.dequeue()!;
            src.push(symToken);

            if (symToken.value === Symbols.DIMLIST_END) {
                break;
            } else if (symToken.value === Symbols.DIMLIST_DELIMITER) {
                if (dims.length === 3) {
                    return boundaryError("配列の次元数の最大は3です.4以上にはできません.", symToken);
                }
            } else {
                return syntaxError(`記号 ${Symbols.DIMLIST_END} または記号 ${Symbols.DIMLIST_DELIMITER} が必要です.`, symToken);
            }
        }

        log.dump("dims", dims);

        const asToken = line.dequeue()!;
        src.push(asToken);

        if (asToken.value.toLowerCase() !== Keyword.AS) {
            return syntaxError(`キーワード"${Keyword.AS}"が必要です.`, asToken);
        }

        const typeToken = line.dequeue()!;
        src.push(typeToken);

        log.dump("type", typeToken.value);

        let vtype: C.Vtype;

        switch (typeToken.value.toLowerCase()) {
            case Keyword.BOOLEAN:
                vtype = C.Vtype.BOOLEAN;
                break;
            case Keyword.FLOAT:
                vtype = C.Vtype.FLOATING_POINT;
                break;
            case Keyword.INTEGER:
                vtype = C.Vtype.INTEGER;
                break;
            case Keyword.STRING:
                vtype = C.Vtype.STRING;
                break;
            default:
                return syntaxError(`型名(${[Keyword.BOOLEAN,Keyword.FLOAT,Keyword.INTEGER,Keyword.STRING].join("/")})が必要です.`, typeToken);
        }

        switch (dims.length) {
            case 1:
                vtype |= C.Vtype.ARRAY_1D;
                break;
            case 2:
                vtype |= C.Vtype.ARRAY_2D;
                break;
            case 3:
                vtype |= C.Vtype.ARRAY_3D;
                break;
            default:
                throw new Error("BUG");
        }

        if (line.len > 1) {
            return syntaxError("不正な文字です.", line.front);
        }

        const varInfo = this.#env.addName(src, arrName, vtype);
        if (varInfo.isErr) {
            return Result.err(varInfo.error);
        }

        log.dump("varInfo", varInfo.result);

        const code = new C.Dim(src, varInfo.result, dims);
        this.#env.addCode(code);

        log.dump("src", Token.lineToString, src);

        log.info("parsed dim.");

        return Result.ok(undefined);
    }

    #parseSub(line: RQueue<Token>): Result<undefined,string> {
        const subToken = line.dequeue()!;
        const src: Token[] = [subToken];

        log.info("parse sub...");

        if (!this.#env.isToplevel) {
            return syntaxError(`${Keyword.SUB}はトップレベルでのみ使用できます.`, subToken);
        }

        const subNameToken = line.dequeue()!;
        src.push(subNameToken);

        log.dump("subName", subNameToken.value);

        if (subNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("ユーザ関数名が必要です.", subNameToken);
        }

        const subName = subNameToken.value.toLowerCase();
 
        const lrbToken = line.dequeue()!;
        src.push(lrbToken);

        if (lrbToken.value !== Symbols.ARGLIST_BEGIN) {
            return syntaxError(`仮引数定義のための記号 ${Symbols.ARGLIST_BEGIN} が必要です.`, lrbToken);
        }

        const argTypes: C.Vtype[] = [];
        const argNames: string[] = [];

        while (line.len) {
            const argNameToken = line.dequeue()!;
            src.push(argNameToken);

            if (argTypes.length === 0 && argNameToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                // 引数なしの関数.
                break;
            }
            if (argNameToken.tokenType !== TokenType.WORD) {
                return syntaxError((argTypes.length ==~ 0 ? `記号 ${Symbols.ARGLIST_END} または` : "") + "仮引数定義が必要です.", argNameToken);
            }
            const argName = argNameToken.value.toLowerCase();
            argNames.push(argName);

            log.dump(`argName[${argNames.length}]`, argName);

            const asToken = line.dequeue()!;
            src.push(asToken);

            if (asToken.value.toLowerCase() !== Keyword.AS) {
                return syntaxError(`キーワード"${Keyword.AS}"が必要です.`, asToken);
            }

            const argTypeToken = line.dequeue()!;
            src.push(argTypeToken);

            const argType = argTypeToken.value.toLowerCase();
            switch (argType) {
                case Keyword.BOOLEAN:
                    argTypes.push(C.Vtype.BOOLEAN);
                    break;
                case Keyword.FLOAT:
                    argTypes.push(C.Vtype.FLOATING_POINT);
                    break;
                case Keyword.INTEGER:
                    argTypes.push(C.Vtype.INTEGER);
                    break;
                case Keyword.STRING:
                    argTypes.push(C.Vtype.STRING);
                    break;
                default:
                    return syntaxError(`型名(${[Keyword.BOOLEAN,Keyword.FLOAT,Keyword.INTEGER,Keyword.STRING].join("/")})が必要です.`, argTypeToken);
            }

            log.dump(`argType[${argTypes.length}]`, argType);

            const symToken = line.dequeue()!;
            src.push(symToken);
            if (symToken.value === Symbols.ARGLIST_END) {
                break;
            }
            if (symToken.value !== Symbols.ARGLIST_DELIMITER) {
                return syntaxError(`記号 ${Symbols.ARGLIST_DELIMITER} または 記号 ${Symbols.ARGLIST_END} が必要です.`, symToken);
            }
        }

        const eolToken = line.dequeue()!;
        if (eolToken.tokenType === TokenType.EOF) {
            return syntaxError(`対となる"${Keyword.END} ${Keyword.SUB}"が必要です.`, eolToken);
        }
        if (eolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字です.", eolToken);
        }

        const retArg = new C.RetArg(C.Vtype.VOID, argTypes);

        const funcInfoRes = this.#env.addUserFunc(src, subName, retArg, true, argNames);
        if (funcInfoRes.isErr) {
            return Result.err(funcInfoRes.error);
        }
        const funcInfo = funcInfoRes.result;

        log.dump("funcInfo", funcInfo);

        log.dump("src", Token.lineToString, src);

        const blockRes = this.#parseCodeBlock();
        if (blockRes.isErr) {
            return Result.err(blockRes.error);
        }
        const lastLine = blockRes.result.lastLine;

        const endToken = lastLine.dequeue()!;

        if (endToken.value.toLowerCase() !== Keyword.END) {
            return syntaxError(`ブロックは"${Keyword.END} ${Keyword.SUB}"で終了する必要があります.`, endToken);
        }
        
        const endSubToken = lastLine.dequeue()!;
        if (endSubToken.value.toLowerCase() !== Keyword.SUB) {
            return syntaxError(`ブロックは"${Keyword.END} ${Keyword.SUB}"で終了する必要があります.`, endToken);
        }

        if (lastLine.len > 1) {
            return syntaxError("不正な文字(あるいは文字列)です.", lastLine.front);
        }

        const innerBlockInfoRes = this.#env.pop();
        U.assert(innerBlockInfoRes.isOk);

        const innerCode = new C.Block(innerBlockInfoRes.result);

        this.#env.addCode(innerCode);

        const outerBlockInfoRes = this.#env.pop();
        U.assert(outerBlockInfoRes.isOk);
        const outerBlockInfo = outerBlockInfoRes.result;

        const defineUserFuncCode = new C.DefineUserFunc(funcInfo, outerBlockInfo);

        this.#env.addCode(defineUserFuncCode);

        log.info("parsed sub.");

        return Result.ok(undefined);
    }

    #parseLet(line: RQueue<Token>): Result<undefined,string> {
        const letToken = line.dequeue()!;
        const src: Token[] = [letToken];

        log.info("parse let...");

        const nameToken = line.dequeue()!;
        src.push(nameToken);

        if (nameToken.tokenType !== TokenType.WORD) {
            return syntaxError("変数名が必要です.", nameToken);
        }
        const name = nameToken.value.toLowerCase();

        log.dump("name", name);

        const eqToken = line.dequeue()!;
        src.push(eqToken);

        if (eqToken.value !== Symbols.ASSIGN_OP) {
            return syntaxError(`記号 ${Symbols.ASSIGN_OP} が必要です.`, eqToken);
        }


        const exprRes = this.#parseExprTokens(line, src);
        if (exprRes.isErr) {
            return Result.err(exprRes.error);
        }
        const expr = exprRes.result;

        log.dump("expr", expr);
        log.dump("exprType", C.Vtype[expr.vtype]);

        if (line.len > 1) {
            return syntaxError("不正な文字です.", line.front);
        }

        const nameInfoRes = this.#env.addName(src, name, expr.vtype);
        if (nameInfoRes.isErr) {
            return Result.err(nameInfoRes.error);
        }

        const nameInfo = nameInfoRes.result;

        log.dump("nameInfo", nameInfo);

        const code = new C.Let(src, nameInfo, expr);

        this.#env.addCode(code);

        log.dump("src", Token.lineToString, src);
        log.info("parsed let.");

        return Result.ok(undefined);
    }

    #parseExprTokens(line: RQueue<Token>, src: Token[]): Result<C.Expr,string> {
        log.info("parse expression...");

        const beforeSize = line.len;

        const res = this.#parseExpr(line);

        const afterSize = line.len;

        const count = beforeSize - afterSize;

        log.dump("number of expression token", count);

        if (!line.recoverN(count).ok) {
            throw new Error("BUG");
        }
        const tokens = line.dequeueN(count);
        if (!tokens.ok) {
            throw new Error("BUG");
        }
        src.push(...tokens.items);

        log.info("parsed expression.");

        return res;
    }

    #parseExpr(line: RQueue<Token>): Result<C.Expr,string> {
        const ops: { src: Token, op: C.BinaryOpInfo }[] = [];
        const terms: C.Expr[] = [];
        
        while (line.len) {
            const termRes = this.#parseExprTerm(line);
            if (termRes.isErr) {
                return termRes;
            }
            const term = termRes.result;
            terms.push(term);

            while (line.front!.value === Symbols.MEMBER_ACCESS_OP) {
                const obj = terms.pop()!;
                const memberedRes = this.#parseExprMember(obj, line);
                if (memberedRes.isErr) {
                    return memberedRes;
                }
                terms.push(memberedRes.result);
            }

            const opToken = line.dequeue()!;
            log.dump("opToken", opToken.value);

            const op = opToken.value.toLowerCase();
            
            if (!BinaryOpMap.has(op)) {
                line.recover();
                break;
            }

            const opInfo = BinaryOpMap.get(op)!;

            while (ops.length > 0 && ops.at(-1)!.op.priority >= opInfo.priority) {
                U.assert(terms.length >= 2);
                const opX = ops.pop()!;
                const termR = terms.pop()!;
                const termL = terms.pop()!;
                const vtypeLRes = C.inferVtype(opX.op.retArg.args[0], termL.vtype);
                if (vtypeLRes.isErr) {
                    return syntaxError("左オペランドの型と演算子が対応してません.", opX.src);
                }
                const vtypeL = vtypeLRes.result;
                const vtypeRRes = C.inferVtype(opX.op.retArg.args[1], termR.vtype);
                if (vtypeRRes.isErr) {
                    return syntaxError("右オペランドの型と演算子が対応してません.", opX.src);
                }
                const vtypeR = vtypeRRes.result;
                let vtypeX = opX.op.retArg.ret;
                if (vtypeX & C.Vtype.INFER) {
                    if (opX.op.retArg.args[0] & C.Vtype.INFER) {
                        const vtypeXLRes = C.inferVtype(vtypeX, vtypeL);
                        if (vtypeXLRes.isErr) {
                            return syntaxError("左オペランドの型と演算子が対応してません.", opX.src);
                        } else {
                            vtypeX = vtypeXLRes.result;
                        }
                    }
                    if (opX.op.retArg.args[1] & C.Vtype.INFER) {
                        const vtypeXRRes = C.inferVtype(vtypeX, vtypeR);
                        if (vtypeXRRes.isErr) {
                            return syntaxError("右オペランドの型と演算子が対応してません.", opX.src);
                        } else {
                            vtypeX = vtypeXRRes.result;
                        }
                    }
                }
                const termX = new C.ExprBinOp(opX.src, vtypeX, opX.op, termL, termR);
                terms.push(termX);
            }

            ops.push({ src: opToken, op: opInfo });
        }

        while (ops.length > 0) {
            U.assert(terms.length >= 2);
            const opX = ops.pop()!;
            const termR = terms.pop()!;
            const termL = terms.pop()!;
            const vtypeLRes = C.inferVtype(opX.op.retArg.args[0], termL.vtype);
            if (vtypeLRes.isErr) {
                return syntaxError("左オペランドの型と演算子が対応してません.", opX.src);
            }
            const vtypeL = vtypeLRes.result;
            const vtypeRRes = C.inferVtype(opX.op.retArg.args[1], termR.vtype);
            if (vtypeRRes.isErr) {
                return syntaxError("右オペランドの型と演算子が対応してません.", opX.src);
            }
            const vtypeR = vtypeRRes.result;
            let vtypeX = opX.op.retArg.ret;
            if (vtypeX & C.Vtype.INFER) {
                if (opX.op.retArg.args[0] & C.Vtype.INFER) {
                    const vtypeXLRes = C.inferVtype(vtypeX, vtypeL);
                    if (vtypeXLRes.isErr) {
                        return syntaxError("左オペランドの型と演算子が対応してません.", opX.src);
                    } else {
                        vtypeX = vtypeXLRes.result;
                    }
                }
                if (opX.op.retArg.args[1] & C.Vtype.INFER) {
                    const vtypeXRRes = C.inferVtype(vtypeX, vtypeR);
                    if (vtypeXRRes.isErr) {
                        return syntaxError("右オペランドの型と演算子が対応してません.", opX.src);
                    } else {
                        vtypeX = vtypeXRRes.result;
                    }
                }
            }
            const termX = new C.ExprBinOp(opX.src, vtypeX, opX.op, termL, termR);
            terms.push(termX);
        }

        U.assert(terms.length === 1);
       
        return Result.ok(terms[0]);
    }

    #parseExprTerm(line: RQueue<Token>): Result<C.Expr,string> {

        const token = line.dequeue()!;

        log.dump("term", token.value);

        switch (token.tokenType) {
            case TokenType.INTEGER:
            case TokenType.BIN_INETGER:
            case TokenType.HEX_INTEGER:
                const intRes = parseNumber(token);
                if (intRes.isErr) {
                    return Result.err(intRes.error);
                }
                return Result.ok(new C.ExprLitInt(token, intRes.result));
            case TokenType.FLOATING_POINT:
                const floatRes = parseNumber(token);
                if (floatRes.isErr) {
                    return Result.err(floatRes.error);
                }
                return Result.ok(new C.ExprLitFloat(token, floatRes.result));
            case TokenType.STRING:
                return Result.ok(new C.ExprLitString(token, token.value));
            case TokenType.OPERATOR:
                if (UnaryOpMap.has(token.value.toLowerCase())) {
                    line.recover();
                    return this.#parseExprUnaryOp(line);
                } else {
                    return syntaxError("不正な文字です.", token);
                }
            case TokenType.LEFT_ROUND_BRACKET:
                const exprRes = this.#parseExpr(line);
                if (exprRes.isErr) {
                    return exprRes;
                }
                const expr = exprRes.result;
                const rrbToken = line.dequeue()!;
                if (rrbToken.tokenType !== TokenType.RIGHT_ROUND_BRACKET) {
                    return syntaxError(`記号 ${Symbols.RIGHT_ROUND_BRACKET} が必要です.`, rrbToken);
                }
                return Result.ok(new C.ExprBracket(token, expr, rrbToken));
            case TokenType.WORD:
                const word = token.value.toLowerCase();
                if (ReservedWordSet.has(word)) {
                    switch (word) {
                        case Keyword.TRUE:
                            return Result.ok(new C.ExprLitBoolean(token, true));
                        case Keyword.FALSE:
                            return Result.ok(new C.ExprLitBoolean(token, false));
                        default:
                            return syntaxError(`この予約語"${token.value}"は式に使用できません.`, token);
                    }
                }
                if (StdFuncWordMap.has(word)) {
                    line.recover();
                    return this.#parseExprStdFunc(line);
                }
                const nameInfo = this.#env.findName(word)!;
                if (nameInfo === undefined) {
                    line.recover();
                    return this.#parseExprUnknownUserFunc(line);
                } else if (nameInfo.vtype & C.Vtype.SUB) {
                    return syntaxError(`ここで戻り値のない${Keyword.SUB}で定義されたユーザ関数は呼べません.`, token);
                } else if (nameInfo.vtype & C.Vtype.FUNC) {
                    line.recover();
                    return this.#parseExprUserFunc(line);
                } else if (nameInfo.vtype & C.Vtype.ARRAY_TYPE) {
                    line.recover();
                    return this.#parseExprArrayVar(line);
                } else {
                    nameInfo.incrementCounter();
                    return Result.ok(new C.ExprVarVal(token, nameInfo));
                }
            default:
                break;
        }

        return syntaxError("不正な文字です.", token);
    }

    #parseExprUnaryOp(line: RQueue<Token>): Result<C.Expr,string> {
        const opToken = line.dequeue()!;
        U.assertEq(opToken.tokenType, TokenType.OPERATOR);

        const unaryOpInfo = UnaryOpMap.get(opToken.value.toLowerCase())!;
        
        switch (line.front!.tokenType) {
            case TokenType.INTEGER:
            case TokenType.BIN_INETGER:
            case TokenType.HEX_INTEGER:
                if (C.inferVtype(unaryOpInfo.vtype, C.Vtype.INTEGER).isOk) {
                    const litIntToken = line.dequeue()!;
                    const litIntRes = parseNumber(litIntToken, unaryOpInfo.kind);
                    if (litIntRes.isErr) {
                        return Result.err(litIntRes.error);
                    }
                    const litInt = litIntRes.result;
                    log.dump("litInt", litInt);
                    return Result.ok(new C.ExprLitInt(litIntToken, litInt, unaryOpInfo));
                } else {
                    return syntaxError(`単項演算子( ${unaryOpInfo.op} )を適用できない型です.`, line.front);
                }
            case TokenType.FLOATING_POINT:
                if (C.inferVtype(unaryOpInfo.vtype, C.Vtype.FLOATING_POINT).isOk) {
                    const litFloatToken = line.dequeue()!;
                    const litFloatRes = parseNumber(litFloatToken, unaryOpInfo.kind);
                    if (litFloatRes.isErr) {
                        return Result.err(litFloatRes.error);
                    }
                    const litFloat = litFloatRes.result;
                    log.dump("litFloat", litFloat);
                    return Result.ok(new C.ExprLitFloat(litFloatToken, litFloat, unaryOpInfo));
                } else {
                    return syntaxError(`単項演算子( ${unaryOpInfo.op} )を適用できない型です.`, line.front);
                }
            case TokenType.WORD:
                if (unaryOpInfo.kind === C.UnaryOpKind.LOGICAL_NOT) {
                    switch (line.front!.value.toLowerCase()) {
                        case Keyword.TRUE:
                            const trueToken = line.dequeue()!;
                            return Result.ok(new C.ExprLitBoolean(trueToken, !true, unaryOpInfo));
                        case Keyword.FALSE:
                            const falseToken = line.dequeue()!;
                            return Result.ok(new C.ExprLitBoolean(falseToken, !false, unaryOpInfo));
                        default:
                            break;
                    }
                }
                break;
            default:
                break;
        }
        const termURes = this.#parseExprTerm(line);
        if (termURes.isErr) {
            return termURes;
        }
        const termU = termURes.result;
        const unaryVtypeRes = C.inferVtype(unaryOpInfo.vtype, termU.vtype);
        if (unaryVtypeRes.isErr) {
            return syntaxError(`単項演算子( ${unaryOpInfo.op} )を適用でない型です.`, opToken);
        }
        return Result.ok(new C.ExprUnaryOp(opToken, unaryVtypeRes.result, unaryOpInfo, termU));
    }

    #parseExprStdFunc(line: RQueue<Token>): Result<C.Expr,string> {
        const nameToken = line.dequeue()!;
        const name = nameToken.value.toLowerCase();
        const funcInfo = StdFuncWordMap.get(name)!;

        if (funcInfo.isSub) {
            return syntaxError(`戻り値のない標準関数${name}は式に使用できません.`, nameToken);
        }

        const lrbToken = line.dequeue()!;
        if (lrbToken.value !== Symbols.ARGLIST_BEGIN) {
            // 関数型とかあれば参照返すのかなあ…？
            return syntaxError(`記号 ${Symbols.ARGLIST_BEGIN} が必要です.`, lrbToken);
        }

        if (funcInfo.retArg.args.length === 0) {
            // 引数なし関数
            const rrbToken = line.dequeue()!;
            if (rrbToken.value !== Symbols.ARGLIST_END) {
                return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, rrbToken);
            }
            return Result.ok(new C.ExprStdFunc(nameToken, funcInfo.retArg.ret, funcInfo, []));
        }

        const args: C.Expr[] = [];

        for (let i = 0; i < funcInfo.retArg.args.length; i++) {
            const token = line.front;
            const argRes = this.#parseExpr(line);
            if (argRes.isErr) {
                return argRes;
            }
            const arg = argRes.result;
            const argVtypeRes = C.inferVtype(funcInfo.retArg.args[i], arg.vtype);
            if (argVtypeRes.isErr) {
                log.dump("arg", arg);
                log.dump("funcInro", funcInfo);
                log.error(argVtypeRes.error);
                return syntaxError(`標準関数${name}の${i+1}番目の引数の型が不一致です.`, token);
            }
            args.push(arg);

            const symToken = line.dequeue()!;
            if (i + 1 < funcInfo.retArg.args.length) {
                if (symToken.value !== Symbols.ARGLIST_DELIMITER) {
                    return syntaxError(`引数を区切る記号 ${Symbols.ARGLIST_DELIMITER} が必要です.`, symToken);
                }
            } else if (symToken.value !== Symbols.ARGLIST_END) {
                return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, symToken);
            }
        }

        let ret: C.Vtype = funcInfo.retArg.ret;
        if (ret & C.Vtype.INFER) {
            // 標準関数の戻り値の型にINFERが含まれるとき、戻り値の型と引数の型はすべて一致させる.(そうでないものを標準関数にしない).
            // 例: min, max, abs, sign など
            for (let i = 0; i < args.length; i++) {
                if (funcInfo.retArg.args[i] & C.Vtype.INFER) {
                    const retVtypeRes = C.inferVtype(ret, args[i].vtype);
                    if (retVtypeRes.isErr) {
                        return syntaxError(`標準関数${name}の第${i+1}番目の引数の型と戻り値の型は揃える必要があります.`, nameToken);
                    }
                    ret = retVtypeRes.result;
                }
            }
        }

        return Result.ok(new C.ExprStdFunc(nameToken, ret, funcInfo, args));
    }

    #parseExprUnknownUserFunc(line: RQueue<Token>): Result<C.Expr,string> {
        const nameToken = line.dequeue()!;
        const name = nameToken.value.toLowerCase();

        if (this.#env.isToplevel) {
            return syntaxError("トップレベルの式でユーザー関数を呼び出すことはできません.", nameToken);
        }

        const lrbToken = line.dequeue()!;
        if (lrbToken.value !== Symbols.ARGLIST_BEGIN) {
            return syntaxError(`${nameToken.value}はユーザ関数と判定されたため記号 ${Symbols.ARGLIST_BEGIN} が必要です.`, lrbToken);
        }

        if (line.front!.value === Symbols.ARGLIST_END) {
            line.dequeue();
            const noArgFuncInfoRes = this.#env.addUserFunc([nameToken], name, new C.RetArg(C.Vtype.INFER_PRIMITIVE, []), false);
            if (noArgFuncInfoRes.isErr) {
                return Result.err(noArgFuncInfoRes.error);
            }
            const noArgFuncInfo = noArgFuncInfoRes.result;
            this.#env.findName(name)!.incrementCounter();
            return Result.ok(new C.ExprUserFunc(nameToken, noArgFuncInfo, []));
        }

        const argTypes: C.Vtype[] = [];
        const argTerms: C.Expr[] = [];

        while (line.len) {
            const token = line.front;
            const argRes = this.#parseExpr(line);
            if (argRes.isErr) {
                return argRes;
            }
            const arg = argRes.result;
            argTypes.push(arg.vtype);
            argTerms.push(arg);

            const symToken = line.dequeue()!;
            if (symToken.value === Symbols.ARGLIST_END) {
                break;
            } else if (symToken.value === Symbols.ARGLIST_DELIMITER) {
                continue;
            } else {
                return syntaxError(`記号 ${Symbols.ARGLIST_DELIMITER} または記号 ${Symbols.ARGLIST_END} が必要です.`, symToken);
            }
        }

        const funcInfoRes = this.#env.addUserFunc([nameToken], name, new C.RetArg(C.Vtype.INFER_PRIMITIVE, argTypes), false);
        if (funcInfoRes.isErr) {
            return Result.err(funcInfoRes.error);
        }

        this.#env.findName(name)!.incrementCounter();
        return Result.ok(new C.ExprUserFunc(nameToken, funcInfoRes.result, argTerms));
    }

    #parseExprUserFunc(line: RQueue<Token>): Result<C.Expr,string> {
        const nameToken = line.dequeue()!;
        const name = nameToken.value.toLowerCase();

        if (this.#env.isToplevel) {
            return syntaxError("トップレベルの式でユーザー関数を呼び出すことはできません.", nameToken);
        }

        const funcInfoList = this.#env.findUserFunc(name);
        U.assert(funcInfoList !== undefined);

        const funcInfo = funcInfoList.find( fi => fi.definition );

        if (funcInfo === undefined) {
            line.recover();
            return this.#parseExprUnknownUserFunc(line);
        }

        const lrbToken = line.dequeue()!;
        if (lrbToken.value !== Symbols.ARGLIST_BEGIN) {
            return syntaxError(`ユーザー関数の呼び出しは名前に続いて記号 ${Symbols.ARGLIST_BEGIN} が必要です.`, lrbToken);
        }

        if (funcInfo.retArg.hasNoArg) {
            const rrbToken = line.dequeue()!;
            if (rrbToken.value !== Symbols.ARGLIST_END) {
                return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, rrbToken);
            }
            this.#env.findName("name")!.incrementCounter();
            return Result.ok(new C.ExprUserFunc(nameToken, funcInfo, []));
        }

        const args: C.Expr[] = [];

        for (let i = 0; i < funcInfo.retArg.args.length; i++) {
            const token = line.front;
            const argRes = this.#parseExpr(line);
            if (argRes.isErr) {
                return argRes;
            }
            const arg = argRes.result;
            if (C.inferVtype(arg.vtype, funcInfo.retArg.args[i]).isErr) {
                return syntaxError(`ユーザ関数${nameToken.value}の呼び出しの${i+1}番目の引数の型が不一致です.`, token);
            }
            args.push(arg);

            const symToken = line.dequeue()!;
            if (i + 1 < funcInfo.retArg.args.length) {
                if (symToken.value !== Symbols.ARGLIST_DELIMITER) {
                    return syntaxError(`記号 ${Symbols.ARGLIST_DELIMITER} が必要です.`, symToken);
                }
            } else if (symToken.value !== Symbols.ARGLIST_END) {
                return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, symToken);
            }
        }

        this.#env.findName(name)!.incrementCounter();

        return Result.ok(new C.ExprUserFunc(nameToken, funcInfo, args));
    }

    #parseExprArrayVar(line: RQueue<Token>): Result<C.Expr,string> {
        const nameToken = line.dequeue()!;
        const name = nameToken.value.toLowerCase();
        const nameInfo = this.#env.findName(name)!;
        const dim = C.arrayDimension(nameInfo.vtype);

        log.dump("dim", dim);

        nameInfo.incrementCounter();

        const lrbToken = line.dequeue()!;
        if (lrbToken.value !== Symbols.DIMLIST_BEGIN) {
            line.recover();
            return Result.ok(new C.ExprArrayRef(nameToken, nameInfo));
        }

        const indexes: C.Expr[] = [];

        for (let i = 0; i < dim; i++) {
            const token = line.front;
            const indexTermRes = this.#parseExpr(line);
            if (indexTermRes.isErr) {
                return indexTermRes;
            }
            const indexTerm = indexTermRes.result;
            if (C.inferVtype(C.Vtype.INTEGER, indexTerm.vtype).isErr) {
                return syntaxError(`配列${nameToken.value}の${i+1}番目の添え字の型が整数型(${Keyword.INTEGER})ではありません.`, token);
            }
            indexes.push(indexTerm);

            // log.dump("index", indexTerm);
            
            const symToken = line.dequeue()!;
            if (i + 1 < dim) {
                if (symToken.value !== Symbols.DIMLIST_DELIMITER) {
                    return syntaxError(`添え字を区切る記号 ${Symbols.DIMLIST_DELIMITER} が必要です.`, symToken);
                }
            } else if (symToken.value !== Symbols.DIMLIST_END) {
                return syntaxError(`記号 ${Symbols.DIMLIST_END} が必要です.`, symToken);
            }
        }

        return Result.ok(new C.ExprArrayVarVal(nameToken, nameInfo, indexes));
    }

    #parseExprMember(obj: C.Expr, line: RQueue<Token>): Result<C.Expr,string> {
        const args: C.Expr[] = [obj];

        const dotToken = line.dequeue()!;
        U.assert(dotToken.value === Symbols.MEMBER_ACCESS_OP);

        const memberToken = line.dequeue!();

        if (memberToken?.tokenType !== TokenType.WORD) {
            return syntaxError("メンバーの指定が必要です.", dotToken);
        }

        const member = memberToken.value.toLowerCase();

        if (StdFuncWordMap.has(member)) {
            const stdFunc = StdFuncWordMap.get(member)!;
            if (stdFunc.isSub) {
                return syntaxError(`戻り値のない標準関数${member}をメンバーとして式に使用することはできません.`, memberToken);
            }
            if (stdFunc.retArg.hasNoArg) {
                return syntaxError(`標準関数${member}はメンバーとして呼び出すことは出来ません.`, memberToken);
            }
            if (C.inferVtype(stdFunc.retArg.args[0], obj.vtype).isErr) {
                return syntaxError(`標準関数${member}の第1引数と同じ型の値からのみメンバーとして呼び出せます.`, memberToken);
            }
            const lrbToken_sf = line.dequeue()!;
            if (lrbToken_sf.value !== Symbols.ARGLIST_BEGIN) {
                return syntaxError(`記号 ${Symbols.ARGLIST_BEGIN} が必要です.`, lrbToken_sf);
            }
            if (stdFunc.retArg.args.length === 1) {
                const rrbToken_sf1 = line.dequeue()!;
                if (rrbToken_sf1.value !== Symbols.ARGLIST_END) {
                    return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, rrbToken_sf1);
                }
                let ret_sf1 = stdFunc.retArg.ret;
                if (ret_sf1 & C.Vtype.INFER) {
                    const inf_sf1Res = C.inferVtype(ret_sf1, obj.vtype);
                    if (inf_sf1Res.isErr) {
                        return syntaxError(`標準関数${member}の第1引数と同じ型の値からのみメンバーとして呼び出せます.`, memberToken);
                    }
                    ret_sf1 = inf_sf1Res.result;
                }
                return Result.ok(new C.ExprMemberStdFunc(memberToken, ret_sf1, stdFunc, args));
            }

            for (let i = 1; i < stdFunc.retArg.args.length; i++) {
                const token_sf = line.front;
                const arg_sfRes = this.#parseExpr(line);
                if (arg_sfRes.isErr) {
                    return arg_sfRes;
                }
                const arg_sf = arg_sfRes.result;
                if (C.inferVtype(stdFunc.retArg.args[i], arg_sf.vtype).isErr) {
                    return syntaxError(`メンバー${member}の${i}番目の引数の型が不一致です.`, token_sf);
                }
                args.push(arg_sf);

                // log.dump("arg_sf", arg_sf);

                const symToken_sf = line.dequeue()!;
                if (i + 1 < stdFunc.retArg.args.length) {
                    if (symToken_sf.value !== Symbols.ARGLIST_DELIMITER) {
                        return syntaxError(`記号 ${Symbols.ARGLIST_DELIMITER} が必要です.`, symToken_sf);
                    }
                } else if (symToken_sf.value !== Symbols.ARGLIST_END) {
                    return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, symToken_sf);
                }
            }

            let ret_sf = stdFunc.retArg.ret;
            if (ret_sf & C.Vtype.INFER) {
                for (let i = 0; i < args.length; i++) {
                    if ((stdFunc.retArg.args[i] & C.Vtype.INFER) !== C.Vtype.INFER) {
                        continue;
                    }
                    const inf_sfRes = C.inferVtype(ret_sf, args[i].vtype);
                    if (inf_sfRes.isErr) {
                        if (i === 0) {
                            return syntaxError(`標準関数${member}の第1引数と同じ型の値からのみメンバーとして呼び出せます.`, memberToken);                            
                        } else {
                            return syntaxError(`メンバー${member}の${i}番目の引数の型と戻り値の型が不一致です.`, args[i].src);
                        }
                    }
                    ret_sf = inf_sfRes.result;
                }
            }

            return Result.ok(new C.ExprMemberStdFunc(memberToken, ret_sf, stdFunc, args));
        }

        if (this.#env.isToplevel) {
            return syntaxError("トップレベルの式でユーザー関数を呼び出すことはできません.", memberToken);
        }

        const userFunc = this.#env.findUserFunc(member)?.find( fi => fi.definition );

        if (userFunc !== undefined) {
            if (userFunc.retArg.ret === C.Vtype.VOID) {
                return syntaxError(`${Keyword.SUB}で定義されているユーザ関数${member}は式中で呼び出せません.`, memberToken);
            }
            if (userFunc.retArg.hasNoArg) {
                return syntaxError(`ユーザ関数${member}はメンバーとして呼び出すことは出来ません.`, memberToken);
            }
            if (C.inferVtype(userFunc.retArg.args[0], obj.vtype).isErr) {
                return syntaxError(`ユーザ関数${member}の第1引数と同じ型の値からのみメンバーとして呼び出せます.`, memberToken);
            }
            const lrbToken_uf = line.dequeue()!;
            if (lrbToken_uf.value !== Symbols.ARGLIST_BEGIN) {
                return syntaxError(`記号 ${Symbols.ARGLIST_BEGIN} が必要です.`, lrbToken_uf);
            }
            if (userFunc.retArg.args.length === 1) {
                const rrbToken_uf1 = line.dequeue()!;
                if (rrbToken_uf1.value !== Symbols.ARGLIST_END) {
                    return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, rrbToken_uf1);
                }
                return Result.ok(new C.ExprMemberUserFunc(memberToken, userFunc, args));
            }
            for (let i = 1; i < userFunc.retArg.args.length; i++) {
                const token_uf = line.front;
                const arg_ufRes = this.#parseExpr(line);
                if (arg_ufRes.isErr) {
                    return arg_ufRes;
                }
                const arg_uf = arg_ufRes.result;
                if (C.inferVtype(userFunc.retArg.args[i], arg_uf.vtype).isErr) {
                    return syntaxError(`メンバー${member}の${i}番目の引数の型が不一致です.`, token_uf);
                }
                args.push(arg_uf);

                // log.dump("arg_uf", arg_uf);

                const symToken_uf = line.dequeue()!;
                if (i + 1 < userFunc.retArg.args.length) {
                    if (symToken_uf.value !== Symbols.ARGLIST_DELIMITER) {
                        return syntaxError(`記号 ${Symbols.ARGLIST_DELIMITER} が必要です.`, symToken_uf);
                    }
                } else if (symToken_uf.value !== Symbols.ARGLIST_END) {
                    return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, symToken_uf);
                }
            }
            this.#env.findName(member)!.incrementCounter();
            return Result.ok(new C.ExprMemberUserFunc(memberToken, userFunc, args));
        }

        const argTypes: C.Vtype[] = [obj.vtype];

        const lrbToken = line.dequeue()!;
        if (lrbToken.value !== Symbols.ARGLIST_BEGIN) {
            return syntaxError(`記号 ${Symbols.ARGLIST_BEGIN} が必要です.`, lrbToken);
        }

        if (line.front!.value === Symbols.ARGLIST_END) {
            line.dequeue();
            const ufi1Res = this.#env.addUserFunc([memberToken], member, new C.RetArg(C.Vtype.INFER_PRIMITIVE, argTypes), false);
            if (ufi1Res.isErr) {
                return Result.err(ufi1Res.error);
            }
            return Result.ok(new C.ExprMemberUserFunc(memberToken, ufi1Res.result, args));
        }

        while (line.len) {
            // const token = line.front;
            const argRes = this.#parseExpr(line);
            if (argRes.isErr) {
                return argRes;
            }
            const arg = argRes.result;
            args.push(arg);
            argTypes.push(arg.vtype);

            // log.dump("arg", arg);

            const symToken = line.dequeue()!;
            if (symToken.value === Symbols.ARGLIST_END) {
                break;
            } else if (symToken.value === Symbols.ARGLIST_DELIMITER) {
                continue;
            } else {
                return syntaxError(`記号 ${Symbols.ARGLIST_DELIMITER} または 記号 ${Symbols.ARGLIST_END} が必要です.`, symToken);
            }
        }

        const ufiRes = this.#env.addUserFunc([memberToken], member, new C.RetArg(C.Vtype.INFER_PRIMITIVE, argTypes), false);
        if (ufiRes.isErr) {
            return Result.err(ufiRes.error);
        }

        this.#env.findName(member)!.incrementCounter();
        
        return Result.ok(new C.ExprMemberUserFunc(memberToken, ufiRes.result, args));
    }

    #parseAssign(line: RQueue<Token>): Result<undefined,string> {
        const nameToken = line.dequeue()!;
        const src: Token[] = [nameToken];

        log.info("parse assign...");

        if (this.#env.isToplevel) {
            return syntaxError("代入はトップレベルでは使用できません.", nameToken);
        }

        const name = nameToken.value.toLowerCase();
        const nameInfo = this.#env.findName(name);

        log.dump("name", name);

        U.assert(nameInfo !== undefined);
        U.assert(nameInfo.hasAnyType(C.Vtype.PRIMITIVE_TYPE));
        U.assert(!nameInfo.hasAnyType(C.Vtype.NON_PRIMITIVE));

        const assignOpToken = line.dequeue()!;
        src.push(assignOpToken);

        const op = AssignOpMap.get(assignOpToken.value);
        if (op === undefined) {
            return syntaxError("代入演算子が必要です.", assignOpToken);
        }

        log.dump("op", op.op);
        
        const ivtRes = C.inferVtype(nameInfo.vtype, op.vtype);
        if (ivtRes.isErr) {
            return syntaxError("型と代入演算子の対応が不一致です.", assignOpToken);
        }

        const exprRes = this.#parseExprTokens(line, src);
        if (exprRes.isErr) {
            return Result.err(exprRes.error);
        }
        const expr = exprRes.result;

        log.dump("expr", expr);

        const ivt2Res = C.inferVtype(expr.vtype, ivtRes.result);
        if (ivt2Res.isErr) {
            return syntaxError("式の型と代入先の変数の型が不一致です.", assignOpToken);
        }
        const vtype = ivt2Res.result;

        if (nameInfo.hasType(C.Vtype.INFER)) {
            nameInfo.updateType(vtype);
        }

        if (line.len > 1) {
            return syntaxError("不正な文字です.", line.front);
        }

        if (op.kind !== C.AssignKind.ASSIGN) {
            nameInfo.incrementCounter();
        }
        nameInfo.markWritten();

        const code = new C.AssignVar(src, op, nameInfo, expr);

        this.#env.addCode(code);

        log.dump("src", Token.lineToString, src);

        log.info("parsed assign.");

        return Result.ok(undefined);
    }

    #parseAssignArray(line: RQueue<Token>): Result<undefined,string> {
        const nameToken = line.dequeue()!;
        const src: Token[] = [nameToken];

        log.info("parse assign array...");

        const name = nameToken.value.toLowerCase();

        log.dump("name", name);

        const nameInfo = this.#env.findName(name);
        U.assert(nameInfo !== undefined);

        log.dump("vtype", C.Vtype[nameInfo.vtype]);

        const lrbToken = line.dequeue()!;
        src.push(lrbToken);

        if (lrbToken.value !== Symbols.DIMLIST_BEGIN) {
            return syntaxError(`記号 ${Symbols.DIMLIST_BEGIN} が必要です.`, lrbToken);
        }

        const dimSize = C.arrayDimension(nameInfo.vtype);

        const indexes: C.Expr[] = [];

        for (let i = 0; i < dimSize; i++) {
            const token = line.front;
            const indexTermRes = this.#parseExprTokens(line, src);
            if (indexTermRes.isErr) {
                return Result.err(indexTermRes.error);
            }
            const indexTerm = indexTermRes.result;

            log.dump("indexTerm", indexTerm);

            if (C.inferVtype(indexTerm.vtype,C.Vtype.INTEGER).isErr) {
                return syntaxError(`配列${nameToken.value}の${i+1}番目の添え字の型が整数型(${Keyword.INTEGER})ではありません.`, token);
            }
            indexes.push(indexTerm);

            const symToken = line.dequeue()!;
            src.push(symToken);

            if (i + 1 < dimSize) {
                if (symToken.value !== Symbols.DIMLIST_DELIMITER) {
                    return syntaxError(`記号 ${Symbols.DIMLIST_DELIMITER} が必要です.`, symToken);
                }
            } else if (symToken.value !== Symbols.DIMLIST_END) {
                return syntaxError(`記号 ${Symbols.DIMLIST_END} が必要です.`, symToken);
            }
        }

        const assignOpToken = line.dequeue()!;
        src.push(assignOpToken);

        const op = AssignOpMap.get(assignOpToken.value);
        if (op === undefined) {
            return syntaxError("代入演算子が必要です.", assignOpToken);
        }

        log.dump("op", op.op);
        
        const ivtRes = C.inferVtype(nameInfo.vtype & C.Vtype.PRIMITIVE_TYPE, op.vtype);
        if (ivtRes.isErr) {
            return syntaxError("型と代入演算子の対応が不一致です.", assignOpToken);
        }

        const exprRes = this.#parseExprTokens(line, src);
        if (exprRes.isErr) {
            return Result.err(exprRes.error);
        }

        const expr = exprRes.result;

        log.dump("expr", expr);

        const ivt2Res = C.inferVtype(expr.vtype, ivtRes.result);
        if (ivt2Res.isErr) {
            return syntaxError("式の型と代入先の配列の要素の型が不一致です.", assignOpToken);
        }
        
        if (line.len > 1) {
            return syntaxError("不正な文字です.", line.front);
        }

        if (op.kind !== C.AssignKind.ASSIGN) {
            nameInfo.incrementCounter();
        }
        nameInfo.markWritten();

        const code = new C.AssignArray(src, op, nameInfo, indexes, expr);

        this.#env.addCode(code);

        log.dump("src", Token.lineToString, src);

        log.info("parsed assign array.");

        return Result.ok(undefined);
    }

    #parseFor(line: RQueue<Token>): Result<undefined,string> {
        const forToken = line.dequeue()!;
        const src: Token[] = [forToken];

        log.info("parse for...");

        const isNewVar = new U.Once<boolean>();

        if (line.front!.value.toLowerCase() === Keyword.LET) {
            src.push(line.dequeue()!);
            isNewVar.set(true);
        } else {
            isNewVar.set(false);
        }

        const loopCounterNameToken = line.dequeue()!;
        src.push(loopCounterNameToken);

        if (loopCounterNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("ループカウンタの変数名が必要です.", loopCounterNameToken);
        }

        const loopCounterName = loopCounterNameToken.value.toLowerCase();

        log.dump("loopCounterName", loopCounterName);

        // for let name = での変数名新規登録は後回し、初期値計算で参照されてしまわないように.

        const assignOpToken = line.dequeue()!;
        src.push(assignOpToken);

        if (assignOpToken.value !== Symbols.ASSIGN_OP) {
            return syntaxError(`記号 ${Symbols.ASSIGN_OP} が必要です.`, assignOpToken);
        }

        const initValueToken = line.front;

        const initValueExprRes = this.#parseExprTokens(line, src);
        if (initValueExprRes.isErr) {
            return Result.err(initValueExprRes.error);
        }
        const initValueExpr = initValueExprRes.result;

        log.dump("initValue", initValueExpr);

        if (initValueExpr.vtype !== C.Vtype.INTEGER) {
            return syntaxError(`ループカウンタの初期値は整数型(${Keyword.INTEGER})である必要があります.`, initValueToken);
        }
        
        const toToken = line.dequeue()!;
        src.push(toToken);

        if (toToken.value.toLowerCase() !== Keyword.TO) {
            return syntaxError(`キーワード"${Keyword.TO}"が必要です.`, toToken);
        }

        const endValueToken = line.front;

        const endValueExprRes = this.#parseExprTokens(line, src);
        if (endValueExprRes.isErr) {
            return Result.err(endValueExprRes.error);
        }
        const endValueExpr = endValueExprRes.result;

        log.dump("endValue", endValueExpr);

        if (endValueExpr.vtype !== C.Vtype.INTEGER) {
            return syntaxError(`ループカウンタの終端値は整数型(${Keyword.INTEGER})である必要があります.`, endValueToken);
        }

        const stepValueExprOption = new U.Once<C.Expr | null>();

        if (line.front!.value.toLowerCase() === Keyword.STEP) {
            src.push(line.dequeue()!);

            const stepValueToken = line.front;
            
            const stepValueExprRes = this.#parseExprTokens(line, src);
            if (stepValueExprRes.isErr) {
                return Result.err(stepValueExprRes.error);
            }
            stepValueExprOption.set(stepValueExprRes.result);

            if (stepValueExprOption.get()!.vtype !== C.Vtype.INTEGER) {
                return syntaxError(`ループカウンタの増減値は整数型(${Keyword.INTEGER})である必要があります.`, stepValueToken);
            }
        } else {
            stepValueExprOption.set(null);
        }
        const stepValueExpr = stepValueExprOption.get();

        log.dump("stepValue", stepValueExpr);

        const eolToken = line.dequeue()!;
        if (eolToken.tokenType === TokenType.EOF) {
            return syntaxError(`対となる"${Keyword.END} ${Keyword.FOR}"が必要です.`, eolToken);
        }
        if (eolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字(あるいは文字列)です.", eolToken);
        }

        log.dump("src", Token.lineToString, src);

        this.#env.push(src);

        const loopCounter = new U.Once<C.NameInfo>();

        if (isNewVar.get()) {
            const newVarInfoRes = this.#env.addName(src, loopCounterName, C.Vtype.INTEGER);
            if (newVarInfoRes.isErr) {
                return Result.err(newVarInfoRes.error);
            }
            loopCounter.set(newVarInfoRes.result);
        } else {
            const varInfo = this.#env.findName(loopCounterName);
            if (varInfo === undefined) {
                return syntaxError(`変数${loopCounterNameToken.value}が定義されてません.`, loopCounterNameToken);
            }
            if (varInfo.vtype !== C.Vtype.INTEGER) {
                return syntaxError(`ループカウンタの変数には整数型(${Keyword.INTEGER})のみ使用できます.`, loopCounterNameToken);
            }
            loopCounter.set(varInfo);
        }
        
        this.#env.push(src);

        const blockRes = this.#parseCodeBlock();
        if (blockRes.isErr) {
            return Result.err(blockRes.error);
        }
        const lastLine = blockRes.result.lastLine;

        const endToken = lastLine.dequeue()!;
        if (endToken.value.toLowerCase() !== Keyword.END) {
            return syntaxError(`"${Keyword.END} ${Keyword.FOR}"が必要です.`, endToken);
        }

        const endForToken = lastLine.dequeue()!;
        if (endForToken.value.toLowerCase() !== Keyword.FOR) {
            return syntaxError(`"${Keyword.END} ${Keyword.FOR}"が必要です.`, endToken);
        }

        if (lastLine.len > 1) {
            return syntaxError("不正な文字(あるいは文字列)です.", lastLine.front);
        }

        const innerBlockInfoRes = this.#env.pop();
        U.assert(innerBlockInfoRes.isOk);

        const innerCode = new C.Block(innerBlockInfoRes.result);

        this.#env.addCode(innerCode);

        const outerBlockInfoRes = this.#env.pop();
        U.assert(outerBlockInfoRes.isOk);
        const outerBlockInfo = outerBlockInfoRes.result;


        // TODO: 

        log.info("parsed for.");

        throw new Unimplemented(line.front);
    }

    #parseIf(line: RQueue<Token>): Result<undefined,string> {
        const ifToken = line.dequeue()!;
        const src: Token[] = [ifToken];

        log.info("parse if...");

        const testExprToken = line.front;

        const testExprRes = this.#parseExprTokens(line, src);
        if (testExprRes.isErr) {
            return Result.err(testExprRes.error);
        }
        const testExpr = testExprRes.result;
        if (testExpr.vtype !== C.Vtype.BOOLEAN) {
            return syntaxError(`条件式は真偽値(${Keyword.BOOLEAN})の式である必要があります.`, testExprToken);
        }

        log.dump("testExpr", testExpr);

        if (line.front!.value.toLowerCase() === Keyword.THEN) {
            src.push(line.dequeue()!);
        }

        const eolToken = line.dequeue()!;
        if (eolToken.tokenType === TokenType.EOF) {
            return syntaxError(`対となる"${Keyword.END} ${Keyword.IF}"が必要です.`, eolToken);
        }
        if (eolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字(あるいは文字列)です.", eolToken);
        }

        log.dump("src", Token.lineToString, src);

        const srcList: Token[][] = [src];           // IF expr [THEN] / ELSE IF expr [THEN] / ELSE
        const testExprList: C.Expr[] = [testExpr];  // IF expr [THEN] / ELSE IF expr [THEN]
        const blockInfoList: C.BlockInfo[] = [];    // IF expr [THEN] / ELSE IF expr [THEN] / ELSE

        for (;;) {
            log.info("parse if-block...");
            // log.dump("if-block src", Token.lineToString, srcList.at(-1)!);

            this.#env.push(srcList.at(-1)!);
            
            const blockRes = this.#parseCodeBlock();
            if (blockRes.isErr) {
                return Result.err(blockRes.error);
            }
            const lastLine = blockRes.result.lastLine;

            const blockInfoRes = this.#env.pop();
            U.assert(blockInfoRes.isOk);
            const blockInfo = blockInfoRes.result;

            blockInfoList.push(blockInfo);

            const blockEndSrc: Token[] = [];

            const blockEndToken = lastLine.dequeue()!;
            blockEndSrc.push(blockEndToken);

            const blockEndKeyword = blockEndToken.value.toLowerCase();

            if (blockEndKeyword === Keyword.END) {
                // END IF
                const blockEndIfToken = lastLine.dequeue()!;
                if (blockEndIfToken.value.toLowerCase() !== Keyword.IF) {
                    return syntaxError(`"${Keyword.END} ${Keyword.IF}"が必要です.`, blockEndToken);
                }
                const blockEndEolToken = lastLine.dequeue()!;
                if (blockEndEolToken.tokenType === TokenType.EOF) {
                    return syntaxError("ここでファイルの末尾は不正です.", blockEndEolToken);
                } else if (blockEndEolToken.tokenType !== TokenType.EOL) {
                    return syntaxError("不正な文字(あるいは文字列)です.", blockEndEolToken);
                }
                break;
            } else if (testExprList.length < blockInfoList.length) {
                // exprが少ない == ELSE ブロック なので END IF が必要
                return syntaxError(`"${Keyword.END} ${Keyword.IF}"が必要です.`, blockEndToken);
            } else if (blockEndKeyword !== Keyword.ELSE) {
                return syntaxError(`"${Keyword.END} ${Keyword.IF}"が必要です.`, blockEndToken);
            }
            // ELSE か ELSE IF expr [THEN]
            if (lastLine.front!.tokenType === TokenType.EOL) {
                // ELSE
                srcList.push(blockEndSrc);
                continue;
            }
            const elseIfToken = lastLine.dequeue()!;
            blockEndSrc.push(elseIfToken);
            
            if (elseIfToken.value.toLowerCase() !== Keyword.IF) {
                return syntaxError(`キーワード"${Keyword.IF}"が必要です.`, elseIfToken);
            }

            const elseIfTestExprToken = lastLine.front;

            const elseIfTestExprRes = this.#parseExprTokens(lastLine, blockEndSrc);
            if (elseIfTestExprRes.isErr) {
                return Result.err(elseIfTestExprRes.error);
            }
            const elseIfTestExpr = elseIfTestExprRes.result;
            testExprList.push(elseIfTestExpr);

            log.dump("elseIfTestExpr", elseIfTestExpr);

            if (elseIfTestExpr.vtype !== C.Vtype.BOOLEAN) {
                return syntaxError(`条件式は真偽値(${Keyword.BOOLEAN})の式である必要があります.`, elseIfTestExprToken);
            }

            if (lastLine.front!.value.toLowerCase() === Keyword.THEN) {
                blockEndSrc.push(lastLine.dequeue()!);
            }

            const elseIfEolToken = lastLine.dequeue()!;
            if (elseIfEolToken.tokenType === TokenType.EOF) {
                return syntaxError(`"${Keyword.END} ${Keyword.IF}"が必要です.`, elseIfEolToken);
            } else if (elseIfEolToken.tokenType !== TokenType.EOL) {
                return syntaxError("不正な文字(あるいは文字列)です.", elseIfEolToken);
            }

            srcList.push(blockEndSrc);
        }

        const code = new C.If(srcList, testExprList, blockInfoList);
        
        this.#env.addCode(code);

        log.info("parsed if.");

        return Result.ok(undefined);
    }
}

export default Parser;
