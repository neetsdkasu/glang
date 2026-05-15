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

export type ParserError = string;

function syntaxError<R>(msg: string, obj: any): Result<R,ParserError> {
    return Result.err(`Syntax Error: ${msg} ( ${obj} )`);
}

function boundaryError<R>(msg: string, obj: any): Result<R,ParserError> {
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
    LET = "let",
    MAIN = "main",
    PRINT = "print",
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
    Keyword.PRINT,
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
    new C.StdFuncInfo("cbool", new C.RetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_PRIMITIVE]), C.SideEffect.NONE),
    new C.StdFuncInfo("cfloat", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.INFER_PRIMITIVE]), C.SideEffect.NONE),
    new C.StdFuncInfo("cint", new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INFER_PRIMITIVE]), C.SideEffect.NONE),
    new C.StdFuncInfo("cstr", new C.RetArg(C.Vtype.STRING, [C.Vtype.INFER_PRIMITIVE]), C.SideEffect.NONE),
    new C.StdFuncInfo("abs", new C.RetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER]), C.SideEffect.NONE),
    new C.StdFuncInfo("sign", new C.RetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER]), C.SideEffect.NONE),
    new C.StdFuncInfo("max", new C.RetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER,C.Vtype.INFER_NUMBER]), C.SideEffect.NONE),
    new C.StdFuncInfo("min", new C.RetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER,C.Vtype.INFER_NUMBER]), C.SideEffect.NONE),
    new C.StdFuncInfo("cos", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), C.SideEffect.NONE),
    new C.StdFuncInfo("sin",  new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), C.SideEffect.NONE),
    new C.StdFuncInfo("tan", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), C.SideEffect.NONE),
    new C.StdFuncInfo("pow", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT,C.Vtype.FLOATING_POINT]), C.SideEffect.NONE),
    new C.StdFuncInfo("sqrt", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), C.SideEffect.NONE),
    new C.StdFuncInfo("floor", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), C.SideEffect.NONE),
    new C.StdFuncInfo("ceil", new C.RetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]), C.SideEffect.NONE),
    new C.StdFuncInfo("size", new C.RetArg(C.Vtype.INTEGER, [C.Vtype.INFER_ARRAY, C.Vtype.INTEGER]), C.SideEffect.NONE),
    new C.StdFuncInfo("sel", new C.RetArg(C.Vtype.INFER_PRIMITIVE, [C.Vtype.BOOLEAN, C.Vtype.INFER_PRIMITIVE, C.Vtype.INFER_PRIMITIVE]), C.SideEffect.NONE)
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
    MEMBER_ACCESS_OP = ".",
    PRINT_DELIMITER = COMMA
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

function parseNumber(token: Token, unaryOp?: C.UnaryOpKind): Result<number,ParserError> {
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
    readonly blockSrc: Readonly<Token[]> | null;
    readonly isLoopTrap: boolean;
    readonly #map: Map<string, C.NameInfo> = new Map();

    constructor(blockId: number, blockSrc: Token[] | null, isLoopTrap: boolean) {
        this.blockId = blockId;
        this.blockSrc = blockSrc;
        this.isLoopTrap = isLoopTrap;
    }

    #newBlockVarId(): number {
        return this.#map.size;
    }

    has(name: string): boolean {
        return this.#map.has(name);
    }

    set(src: Token[], name: string, vtype: C.Vtype, varId: number, isLoopCounter?: boolean): C.NameInfo {
        U.assert(!isLoopCounter || vtype === C.Vtype.INTEGER);
        const nameInfo = new C.NameInfo(src, name, vtype, varId, this.blockId, this.#newBlockVarId(), isLoopCounter ?? false);
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
    #definitionUserFunc: C.FuncInfo | null = null; // returnの型チェック用
    #blockEndStack: C.BlockEndKind[] = []; // ブロックのコードリスト内でbreak/continue/returnの出現情報を保持する.それ以降のコードをデッドコードにするための情報.

    constructor() {}

    reset(): void {
        this.#totalBlockCount = 0;
        this.#nameMapStack = [];
        this.#codeBodyStack = [];
        this.#totalVarCount = 0;
        this.#userFuncMap.clear();
        this.#uniqueNameMap.clear();
        this.#definitionUserFunc = null;
        this.#blockEndStack = [];
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

    get definitionUserFunc(): C.FuncInfo {
        U.assert(this.#definitionUserFunc !== null);
        return this.#definitionUserFunc;
    }

    findLoopTrapBlock(): Readonly<{ blockId: number, blockSrc: Readonly<Token[]> | null }> | undefined {
        for (let i = this.#nameMapStack.length-1; i >= 0; i--) {
            if (this.#nameMapStack[i].isLoopTrap) {
                return this.#nameMapStack[i];
            }
        }
        return undefined;
    }

    findUndefinedUserFuncs(): C.FuncInfo[] {
        const ret: C.FuncInfo[] = [];
        for (const fiList of this.#userFuncMap.values()) {
            U.assert(fiList.length > 0);
            if (fiList.some( fi => fi.definition )) {
                continue;
            }
            ret.push(fiList[0]);
        }
        return ret;
    }

    rebuild(): Result<undefined,ParserError> {
        const n = this.#codeBodyStack.length;
        const before: C.Code[] = this.#codeBodyStack[n-1];
        const after: C.Code[] = [];
        const fuf = (name: string) => this.#userFuncMap.get(name)!.find( fi => fi.definition )!;
        for (const code of before) {
            const newCodeRes = code.rebuild(fuf);
            if (newCodeRes.isErr) {
                const err = newCodeRes.error;
                return syntaxError(err.msg, err.src);
            }
            after.push(newCodeRes.result.code);
        }
        this.#codeBodyStack[n-1] = after;
        return Result.ok(undefined);
    }

    isGlobalBlockId(blockId: number): boolean {
        U.assert(this.#nameMapStack.length > 0);
        return this.#nameMapStack[0].blockId === blockId;
    }

    isGlobalName(name: string): boolean {
        U.assert(this.#nameMapStack.length > 0);
        return this.#nameMapStack[0].has(name);
    }

    get isBlockEnd(): boolean {
        return this.#blockEndStack.at(-1) !== C.BlockEndKind.NONE;
    }

    /**
     * ブロックのコードリスト内のbreak/continue/returnの出現を記録する.
     * break/continue/returnの処理側で呼び出す.Env内からは呼び出さない.
     */
    setBlockEnd(kind: C.BlockEndKind): void {
        log.debug("set block end");
        log.dump("kind", C.BlockEndKind[kind]);
        U.assert(!this.isToplevel);
        U.assert(this.#codeBodyStack.at(-1)!.length > 0);
        const n = this.#blockEndStack.length;
        U.assert(this.#blockEndStack[n-1] === C.BlockEndKind.NONE);
        this.#blockEndStack[n-1] = kind;
    }

    /**
     * 変数名などを束縛するブロックをブロックネスト最深部に追加します.
     * 
     * @param blockSrc ブロックを構築するソースコード情報(func/sub/for/if/elseなど). トップレベルのみnull.
     * @returns 新しく作られたブロックのID
     */
    push(blockSrc: Token[] | null, isLoopTrap?: boolean): number {
        log.debug("new block");
        log.dump("block src", Token.lineToString, blockSrc ?? []);
        const blockId = this.#newBlockId();
        this.#nameMapStack.push(new NameMap(blockId, blockSrc, isLoopTrap ?? false));
        this.#codeBodyStack.push([]);
        this.#blockEndStack.push(C.BlockEndKind.NONE);
        return blockId;
    }

    /**
     * 最深ブロックを取り除きます.
     * 
     * @returns 
     */
    pop(): C.BlockInfo {
        log.debug("drop block");

        U.assert(this.#nameMapStack.length > 0);
        U.assert(this.#codeBodyStack.length > 0);
        U.assert(this.#blockEndStack.length > 0);

        const map = this.#nameMapStack.pop()!;

        const src = map.blockSrc ?? [];
        const id = map.blockId;
        const parentId = this.#nameMapStack.at(-1)?.blockId;
        const varList = map.getNameList();
        const body = this.#codeBodyStack.pop()!;        
        const blockEnd = this.#blockEndStack.pop()!;

        const blockInfo = new C.BlockInfo(src, id, parentId, varList, body, blockEnd);

        log.dump("block src", Token.lineToString, src);

        if (this.isToplevel) {
            this.#definitionUserFunc = null;
        }

        return blockInfo;
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
    addName(src: Token[], name: string, vtype: C.Vtype, isLoopCounter?: boolean): Result<C.NameInfo,ParserError> {
        U.assert(!isLoopCounter || vtype === C.Vtype.INTEGER);
        log.debug("add name");
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
        const nameInfo = current.set(src, name, vtype, this.#newVarId(), isLoopCounter);
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
    addCode(code: C.Code): boolean {
        if (this.#blockEndStack.at(-1)! !== C.BlockEndKind.NONE) {
            return false;
        }
        this.#codeBodyStack.at(-1)!.push(code);
        return true;
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
     * 定義でこのメソッドの呼び出しのときブロックを二段分積む(#env.push)のでend func/subの処理ではブロックを二段分取り出す(#env.pop)必要があります.
     * 
     * @param src 
     * @param name 
     * @param retArg 
     * @param definition 
     * @param argNames 仮引数名のリスト.関数定義の場合は必須.関数呼び出しの場合は省略またｈundefinedを渡す必要があります.
     * @returns 
     */
    addUserFunc(src: Token[], name: string, retArg: C.RetArg, definition: boolean, argNames?: string[] | undefined): Result<C.FuncInfo,ParserError> {
        log.debug("add func");
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
            U.assert(this.isToplevel);
            U.assert(argNames !== undefined);
            U.assert(retArg.args.length === argNames.length);
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
            U.assert(C.inferVtype(varInfo.vtype, C.Vtype.INFER_CALLABLE).isOk);
            varId = varInfo.varId;
            if (definition) {
                const vtype = retArg.ret === C.Vtype.VOID ? C.Vtype.SUB : C.Vtype.FUNC;
                this.#nameMapStack.at(0)!.set(src, name, vtype, varId).suck(varInfo);
            }
        } else {
            U.assert(retArg.ret === C.Vtype.UNKNOWN || retArg.ret === C.Vtype.VOID ||
                    (retArg.ret & C.Vtype.UNKNOWN) === (retArg.ret & C.Vtype.INFER_PRIMITIVE));
            const vtype = retArg.ret === C.Vtype.UNKNOWN ? C.Vtype.INFER_CALLABLE
                        : retArg.ret === C.Vtype.VOID ? C.Vtype.SUB : C.Vtype.FUNC;
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
        if (definition) {
            this.#definitionUserFunc = funcInfo;
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
    #scanLine(): Result<RQueue<Token>,ParserError> {
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

    parse(): Result<C.BlockInfo,ParserError> {
        log.debug("START PARSE...");

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

            let res: Result<undefined,ParserError>;

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
                    res = this.#parseFunc(line);
                    break;
                default:
                    return syntaxError(`トップレベルで"${cmdToken.value}"から行頭の開始はできません.`, cmdToken);
            }

            if (res.isErr) {
                return Result.err(res.error);
            }
        }

        const mainSub = this.#env.findUserFunc(Keyword.MAIN)?.find( fi => fi.definition );
        if (mainSub === undefined) {
            return syntaxError(`"${Keyword.SUB} ${Keyword.MAIN}"が必要です.`, this.#scanner);
        }

        if (!this.#env.isToplevel) {
            // ブロックが閉じておらずendが足りてない
            return syntaxError("ここでソースコードの末尾は不正です.", this.#scanner);
        }

        const undefinedUserFuncList = this.#env.findUndefinedUserFuncs();
        if (undefinedUserFuncList.length > 0) {
            const fi = undefinedUserFuncList[0];
            return syntaxError(`${fi.name}が定義されてません.`, Token.lineToString(fi.src));
        }

        const rebuildRes = this.#env.rebuild();
        if (rebuildRes.isErr) {
            return Result.err(rebuildRes.error);
        }

        log.debug("END PARSE.");

        return Result.ok(this.#env.pop());
    }

    /**
     * コードブロックを読み取る.
     * sub/func/for/if/doなど内部コードブロックを読み取る際に呼び出す.
     * このメソッドを呼び出す前にthis.#env.push(...)でブロックを生成する必要がある.
     * このメソッドの呼び出し後はthis.#env.pop()でブロックを完了する必要がある.
     * endかelseで始まる行に到達するまでコードを読み取る.
     * @returns 読み取りに成功した場合はlastLineフィールドにendかelseで始まる文を収めたオブジェクトを返す.失敗した場合はエラーメッセージを返す.
     */
    #parseCodeBlock(): Result<{ lastLine: RQueue<Token> },ParserError> {
        log.debug("PARSE block...");
        
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

            let res: Result<undefined,ParserError>;

            const cmd = cmdToken.value.toLowerCase();

            switch (cmd) {
                case Keyword.ELSE:
                case Keyword.END:
                    log.debug("PARSED block.");
                    return Result.ok({ lastLine: line });
            }

            if (this.#env.isBlockEnd) {
                return syntaxError("デッドコードです.", cmdToken);
            }

            switch (cmd) {
                case Keyword.SUB:
                case Keyword.FUNC:
                    return syntaxError("ブロック内でユーザ関数の定義はできません.", cmdToken);
                case Keyword.BREAK:
                    res = this.#parseBreak(line);
                    break;
                case Keyword.CALL:
                    res = this.#parseCall(line);
                    break;
                case Keyword.CONTINUE:
                    res = this.#parseContinue(line);
                    break;
                case Keyword.DIM:
                    res = this.#parseDim(line);
                    break;
                case Keyword.DO:
                    res = this.#parseDoWhile(line);
                    break;
                case Keyword.FOR:
                    res = this.#parseFor(line);
                    break;
                case Keyword.IF:
                    res = this.#parseIf(line);
                    break;
                case Keyword.LET:
                    res = this.#parseLet(line);
                    break;
                case Keyword.PRINT:
                    res = this.#parsePrint(line);
                    break;
                case Keyword.RETURN:
                    res = this.#parseReturn(line);
                    break;
                default:
                    const nameInfo = this.#env.findName(cmd);
                    if (nameInfo !== undefined) {
                        if (nameInfo.vtype & C.Vtype.REFERENCE_VAR) {
                            // 現時点で実装の予定なし.
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

    /**
     * 配列定義のdim文を読み取る.
     * @param line 
     * @returns 
     */
    #parseDim(line: RQueue<Token>): Result<undefined,ParserError> {
        const dimToken = line.dequeue()!;
        const src: Token[] = [dimToken];

        log.debug("PARSE dim...");

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

        log.debug("PARSED dim.");

        return Result.ok(undefined);
    }

    /**
     * 戻り値のないユーザ関数定義のsub文および内部コードブロックを読み取る.
     * @param line 
     * @returns 
     */
    #parseSub(line: RQueue<Token>): Result<undefined,ParserError> {
        const subToken = line.dequeue()!;
        const src: Token[] = [subToken];

        log.debug("PARSE sub...");

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

        const innerBlockInfo = this.#env.pop();

        const innerCode = new C.Block(innerBlockInfo);

        this.#env.addCode(innerCode);

        const outerBlockInfo = this.#env.pop();

        const defineUserFuncCode = new C.DefineUserFunc(funcInfo, outerBlockInfo);

        this.#env.addCode(defineUserFuncCode);

        log.debug("PARSED sub.");

        return Result.ok(undefined);
    }

    /**
     * 変数の宣言と初期化のlet文を読み取る.
     * @param line 
     * @returns 
     */
    #parseLet(line: RQueue<Token>): Result<undefined,ParserError> {
        const letToken = line.dequeue()!;
        const src: Token[] = [letToken];

        log.debug("PARSE let...");

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
        log.debug("PARSED let.");

        return Result.ok(undefined);
    }

    /**
     * 各命令文の処理内で式をパースする際はこのメソッドを呼び出す.
     * @param line 
     * @param src 
     * @returns 
     */
    #parseExprTokens(line: RQueue<Token>, src: Token[]): Result<C.Expr,ParserError> {
        log.debug("PARSE expression...");

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

        log.debug("PARSED expression.");

        return res;
    }

    /**
     * 式を読み取る.2つの項と二項演算子を1つ項にまとめる.
     * 名前が#parseExprから始まるメソッドからのみ呼び出す.他のメソッドから呼び出さない.
     * 
     * @param line 
     * @returns 
     */
    #parseExpr(line: RQueue<Token>): Result<C.Expr,ParserError> {
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
                const vtypeRes = opX.op.retArg.inferTypes(opX.op.retArg.ret, termL.vtype, termR.vtype);
                if (vtypeRes.isErr) {
                    return syntaxError(vtypeRes.error, opX.src);
                }
                const vtypeX = vtypeRes.result.ret;
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
            const vtypeRes = opX.op.retArg.inferTypes(opX.op.retArg.ret, termL.vtype, termR.vtype);
            if (vtypeRes.isErr) {
                return syntaxError(vtypeRes.error, opX.src);
            }
            const vtypeX = vtypeRes.result.ret;
            const termX = new C.ExprBinOp(opX.src, vtypeX, opX.op, termL, termR);
            terms.push(termX);
        }

        U.assert(terms.length === 1);
       
        return Result.ok(terms[0]);
    }

    /**
     * 項を読み取る.     
     * 名前が#parseExprから始まるメソッドからのみ呼び出す.他のメソッドから呼び出さない.
     * @param line 
     * @returns 
     */
    #parseExprTerm(line: RQueue<Token>): Result<C.Expr,ParserError> {

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

    /**
     * 単項演算子を読み取る.
     * 名前が#parseExprから始まるメソッドからのみ呼び出す.他のメソッドから呼び出さない.
     * @param line 
     * @returns 
     */
    #parseExprUnaryOp(line: RQueue<Token>): Result<C.Expr,ParserError> {
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

    /**
     * 標準関数の呼び出しを読み取る.
     * 名前が#parseExprから始まるメソッドからのみ呼び出す.他のメソッドから呼び出さない.
     * @param line 
     * @returns 
     */
    #parseExprStdFunc(line: RQueue<Token>): Result<C.Expr,ParserError> {
        const nameToken = line.dequeue()!;
        const name = nameToken.value.toLowerCase();
        const funcInfo = StdFuncWordMap.get(name)!;

        if (funcInfo.isSub) {
            return syntaxError(`戻り値のない標準関数${name}は式に使用できません.`, nameToken);
        }

        if (!this.#env.isToplevel) {
            this.#env.definitionUserFunc.addSideEffect(funcInfo.sideEffect);
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

    /**
     * 後置で定義されているかもしれないユーザ関数の呼び出しを読み取る.
     * 名前が#parseExprから始まるメソッドからのみ呼び出す.他のメソッドから呼び出さない.
     * @param line 
     * @returns 
     */
    #parseExprUnknownUserFunc(line: RQueue<Token>): Result<C.Expr,ParserError> {
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

    /**
     * 前置で定義済みのユーザ関数の呼び出しを読み取る.
     * 名前が#parseExprから始まるメソッドからのみ呼び出す.他のメソッドから呼び出さない.
     * @param line 
     * @returns 
     */
    #parseExprUserFunc(line: RQueue<Token>): Result<C.Expr,ParserError> {
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

        this.#env.definitionUserFunc.addSideEffect(funcInfo.sideEffect);

        const lrbToken = line.dequeue()!;
        if (lrbToken.value !== Symbols.ARGLIST_BEGIN) {
            return syntaxError(`ユーザー関数の呼び出しは名前に続いて記号 ${Symbols.ARGLIST_BEGIN} が必要です.`, lrbToken);
        }

        if (funcInfo.retArg.hasNoArg) {
            const rrbToken = line.dequeue()!;
            if (rrbToken.value !== Symbols.ARGLIST_END) {
                return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, rrbToken);
            }
            this.#env.findName(name)!.incrementCounter();
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

    /**
     * 配列の要素参照を読み込む.
     * 名前が#parseExprから始まるメソッドからのみ呼び出す.他のメソッドから呼び出さない.
     * @param line 
     * @returns 
     */
    #parseExprArrayVar(line: RQueue<Token>): Result<C.Expr,ParserError> {
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

    /**
     * メンバ呼び出ししている関数を読み込む.
     * 名前が#parseExprから始まるメソッドからのみ呼び出す.他のメソッドから呼び出さない.
     * @param obj 
     * @param line 
     * @returns 
     */
    #parseExprMember(obj: C.Expr, line: RQueue<Token>): Result<C.Expr,ParserError> {
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
            if (!this.#env.isToplevel) {
                this.#env.definitionUserFunc.addSideEffect(stdFunc.sideEffect);
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
            this.#env.definitionUserFunc.addSideEffect(userFunc.sideEffect);
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

    /**
     * 変数への代入文を読み取る.
     * @param line 
     * @returns 
     */
    #parseAssign(line: RQueue<Token>): Result<undefined,ParserError> {
        const nameToken = line.dequeue()!;
        const src: Token[] = [nameToken];

        log.debug("PARSE assign...");

        if (this.#env.isToplevel) {
            return syntaxError("代入はトップレベルでは使用できません.", nameToken);
        }

        const name = nameToken.value.toLowerCase();
        const nameInfo = this.#env.findName(name);

        log.dump("name", name);

        U.assert(nameInfo !== undefined);
        U.assert(nameInfo.hasAnyType(C.Vtype.PRIMITIVE_TYPE));
        U.assert(!nameInfo.hasAnyType(C.Vtype.NON_PRIMITIVE));

        if (nameInfo.isLoopCounter) {
            return syntaxError("ループカウンタへの代入は不正です.", nameToken);
        }

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
            nameInfo.updateType(vtype, src);
        }

        if (line.len > 1) {
            return syntaxError("不正な文字です.", line.front);
        }

        if (op.kind !== C.AssignKind.ASSIGN) {
            nameInfo.incrementCounter();
        }
        nameInfo.markWritten();

        if (this.#env.isGlobalName(name)) {
            this.#env.definitionUserFunc.addSideEffect(C.SideEffect.WRITE_GLOBAL_VAR);
        }

        const code = new C.AssignVar(src, op, nameInfo, expr);

        this.#env.addCode(code);

        log.dump("src", Token.lineToString, src);

        log.debug("PARSED assign.");

        return Result.ok(undefined);
    }

    /**
     * 配列要素への代入文を読み取る.
     * @param line 
     * @returns 
     */
    #parseAssignArray(line: RQueue<Token>): Result<undefined,ParserError> {
        const nameToken = line.dequeue()!;
        const src: Token[] = [nameToken];

        log.debug("PARSE assign array...");

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

        if (this.#env.isGlobalName(name)) {
            this.#env.definitionUserFunc.addSideEffect(C.SideEffect.WRITE_GLOBAL_VAR);
        }

        const code = new C.AssignArray(src, op, nameInfo, indexes, expr);

        this.#env.addCode(code);

        log.dump("src", Token.lineToString, src);

        log.debug("PARSED assign array.");

        return Result.ok(undefined);
    }

    /**
     * for文および内部コードブロックを読み取る.
     * @param line 
     * @returns 
     */
    #parseFor(line: RQueue<Token>): Result<undefined,ParserError> {
        const forToken = line.dequeue()!;
        const src: Token[] = [forToken];

        log.debug("PARSE for...");

        const letToken = line.dequeue()!;
        src.push(letToken);

        if (letToken.value.toLowerCase() !== Keyword.LET) {
            return syntaxError(`キーワード"${Keyword.LET}"が必要です.`, letToken);
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

        let  stepValueExpr: C.Expr | null;

        if (line.front!.value.toLowerCase() === Keyword.STEP) {
            src.push(line.dequeue()!);

            const stepValueToken = line.front;
            
            const stepValueExprRes = this.#parseExprTokens(line, src);
            if (stepValueExprRes.isErr) {
                return Result.err(stepValueExprRes.error);
            }
            stepValueExpr = stepValueExprRes.result;

            if (stepValueExpr.vtype !== C.Vtype.INTEGER) {
                return syntaxError(`ループカウンタの増減値は整数型(${Keyword.INTEGER})である必要があります.`, stepValueToken);
            }
        } else {
            stepValueExpr = null;
        }

        log.dump("stepValue", stepValueExpr);

        const eolToken = line.dequeue()!;
        if (eolToken.tokenType === TokenType.EOF) {
            return syntaxError(`対となる"${Keyword.END} ${Keyword.FOR}"が必要です.`, eolToken);
        }
        if (eolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字(あるいは文字列)です.", eolToken);
        }

        log.dump("src", Token.lineToString, src);

        // outer block.
        // 初期値、終端値、増減値をここのブロックに記憶する.
        // ループカウンタ変数が新規定義の場合の紐付けブロックになる.
        const blockId = this.#env.push(src, true);

        const initValueNameInfo = this.#env.addName(src, `#init#${blockId}`, C.Vtype.INTEGER).result;
        const endValueNameInfo = this.#env.addName(src, `#end#${blockId}`, C.Vtype.INTEGER).result;
        const stepValueNameInfo = this.#env.addName(src, `#step#${blockId}`, C.Vtype.INTEGER).result;

        const newVarInfoRes = this.#env.addName(src, loopCounterName, C.Vtype.INTEGER, true);
        if (newVarInfoRes.isErr) {
            return Result.err(newVarInfoRes.error);
        }
        const loopCounter = newVarInfoRes.result;
        
        // inner block.
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

        const endEolToken = lastLine.dequeue()!;
        if (endEolToken.tokenType === TokenType.EOF) {
            return syntaxError("ここでソースコードの末尾は不正です.", endEolToken)
        } else if (endEolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字(あるいは文字列)です.", endEolToken);
        }

        const innerBlockInfo = this.#env.pop();

        // inner block を C.Code にする必要があるのかは要検討.
        const innerCode = new C.Block(innerBlockInfo);
        this.#env.addCode(innerCode);

        if (innerBlockInfo.blockEnd & C.BlockEndKind.RETURN) {
            // 条件次第ではループ内を1回も実行しない場合がありend for以降はデッドコードにはならない.
            // this.#env.setBlockEnd(C.BlockEndKind.RETURN);
        }

        const outerBlockInfo = this.#env.pop();

        const initValue = { nameInfo: initValueNameInfo, expr: initValueExpr };
        const endValue = { nameInfo: endValueNameInfo, expr: endValueExpr };
        const stepValue = { nameInfo: stepValueNameInfo, expr: stepValueExpr };

        const code = new C.For(src, loopCounter, outerBlockInfo, initValue, endValue, stepValue);

        this.#env.addCode(code);

        if (outerBlockInfo.blockEnd & C.BlockEndKind.RETURN) {
            // 条件次第ではループ内を1回も実行しない場合がありend for以降はデッドコードにはならない.
            // this.#env.setBlockEnd(C.BlockEndKind.RETURN);
        }

        log.debug("PARSED for.");

        return Result.ok(undefined);
    }

    /**
     * if文およびelse文およびそれらの内部コードブロックを読み取る.
     * @param line 
     * @returns 
     */
    #parseIf(line: RQueue<Token>): Result<undefined,ParserError> {
        const ifToken = line.dequeue()!;
        const src: Token[] = [ifToken];

        log.debug("PARSE if...");

        const testExprToken = line.front;

        const testExprRes = this.#parseExprTokens(line, src);
        if (testExprRes.isErr) {
            return Result.err(testExprRes.error);
        }
        const testExpr = testExprRes.result;
        if (C.inferVtype(testExpr.vtype, C.Vtype.BOOLEAN).isErr) {
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
            log.debug("PARSE if-block...");
            // log.dump("if-block src", Token.lineToString, srcList.at(-1)!);

            this.#env.push(srcList.at(-1)!);
            
            const blockRes = this.#parseCodeBlock();
            if (blockRes.isErr) {
                return Result.err(blockRes.error);
            }
            const lastLine = blockRes.result.lastLine;

            const blockInfo = this.#env.pop();

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
                    return syntaxError("ここでソースコードの末尾は不正です.", blockEndEolToken);
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

            if (C.inferVtype(elseIfTestExpr.vtype, C.Vtype.BOOLEAN).isErr) {
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

        if (testExprList.length !== blockInfoList.length) {
            // ELSE 節 が存在するとき、end if以降がデッドコードになるかを判定.
            // すべての分岐で何らかの脱出コード(break/continue/return)で終わっている場合にend if以降はデッドコードになる.
            let kind = C.BlockEndKind.ALL;
            for (const bi of blockInfoList) {
                kind &= bi.blockEnd;
            }
            if (kind & C.BlockEndKind.ALL) {
                for (const bi of blockInfoList) {
                    kind |= bi.blockEnd;
                }
                this.#env.setBlockEnd(kind & C.BlockEndKind.ALL);
            }
        }

        log.debug("PARSED if.");

        return Result.ok(undefined);
    }

    /**
     * call文を読み取る.
     * @param line 
     * @returns 
     */
    #parseCall(line: RQueue<Token>): Result<undefined,ParserError> {
        const callToken = line.dequeue()!;
        const src: Token[] = [callToken];

        log.debug("PARSE call...");

        const funcNameToken = line.dequeue()!;
        src.push(funcNameToken);

        if (funcNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("関数名が必要です.", funcNameToken);
        }

        const funcName = funcNameToken.value.toLowerCase();

        log.dump("funcName", funcName);

        const lrbToken = line.dequeue()!;
        src.push(lrbToken);

        if (lrbToken.value !== Symbols.ARGLIST_BEGIN) {
            return syntaxError(`記号 ${Symbols.ARGLIST_BEGIN} が必要です.`, lrbToken);
        }

        if (StdFuncWordMap.has(funcName)) {
            const stdFuncInfo = StdFuncWordMap.get(funcName)!;

            if (stdFuncInfo.retArg.hasNoArg) {
                const stdFuncRrbToken = line.dequeue()!;
                src.push(stdFuncRrbToken);
                if (stdFuncRrbToken.value !== Symbols.ARGLIST_END) {
                    return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, stdFuncRrbToken);
                }
                const stdFuncNoArgEolToken = line.dequeue()!;
                if (stdFuncNoArgEolToken.tokenType === TokenType.EOF) {
                    return syntaxError("ここでソースコードの末尾は不正です.", stdFuncNoArgEolToken);
                } else if (stdFuncNoArgEolToken.tokenType !== TokenType.EOL) {
                    return syntaxError("不正な文字(あるいは文字列)です.", stdFuncNoArgEolToken);
                }
                const stdFuncNoArgCode = new C.CallStdFunc(src, stdFuncInfo, []);
                this.#env.addCode(stdFuncNoArgCode);
                log.dump("src", Token.lineToString, src);
                log.debug("PARSED call. [no arg std func]");
                return Result.ok(undefined);
            }

            const stdFuncArgs: C.Expr[] = [];

            for (let i = 0; i < stdFuncInfo.retArg.args.length; i++) {
                const stdFuncArgToken = line.front;

                const stdFuncArgRes = this.#parseExprTokens(line, src);
                if (stdFuncArgRes.isErr) {
                    return Result.err(stdFuncArgRes.error);
                }
                const stdFuncArg = stdFuncArgRes.result;
                stdFuncArgs.push(stdFuncArg);

                log.dump("stdFuncArg", stdFuncArg);

                if (C.inferVtype(stdFuncInfo.retArg.args[i], stdFuncArg.vtype).isErr) {
                    return syntaxError(`標準関数${funcName}の${i+1}番目の引数の型が不一致です.`, stdFuncArgToken);
                }

                const stdFuncSymToken = line.dequeue()!;
                src.push(stdFuncSymToken);

                if (i + 1 < stdFuncInfo.retArg.args.length) {
                    if (stdFuncSymToken.value !== Symbols.ARGLIST_DELIMITER) {
                        return syntaxError(`記号 ${Symbols.ARGLIST_DELIMITER} が必要です.`, stdFuncSymToken);
                    }
                } else if (stdFuncSymToken.value !== Symbols.ARGLIST_END) {
                    return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, stdFuncSymToken);
                }
            }

            if (stdFuncInfo.retArg.ret & C.Vtype.INFER) {
                let stdFuncRet = stdFuncInfo.retArg.ret;
                for (let i = 0; i < stdFuncInfo.retArg.args.length; i++) {
                    if (stdFuncInfo.retArg.args[i] & C.Vtype.INFER) {
                        const stdFuncTypeInfer = C.inferVtype(stdFuncRet, stdFuncArgs[i].vtype);
                        if (stdFuncTypeInfer.isErr) {
                            return syntaxError(`標準関数${funcName}の${i+1}番目の引数の型が不一致です.`, stdFuncArgs[i].src);
                        }
                        stdFuncRet = stdFuncTypeInfer.result;
                    }
                }
            }

            const stdFuncEolToken = line.dequeue()!;
            if (stdFuncEolToken.tokenType === TokenType.EOF) {
                return syntaxError("ここでファイルの末尾は不正です.", stdFuncEolToken);
            } else if (stdFuncEolToken.tokenType !== TokenType.EOL) {
                return syntaxError("不正な文字(あるいは文字列)です.", stdFuncEolToken);
            }

            const stdFuncCode = new C.CallStdFunc(src, stdFuncInfo, stdFuncArgs);
            this.#env.addCode(stdFuncCode);
            log.dump("src", Token.lineToString, src);
            log.debug("PARSED call. [std func]");
            return Result.ok(undefined);
        }

        const userFunc = this.#env.findUserFunc(funcName)?.find( fi => fi.definition );

        if (userFunc !== undefined) {

            if (userFunc.retArg.hasNoArg) {
                const userFuncRrbToken = line.dequeue()!;
                src.push(userFuncRrbToken);
                if (userFuncRrbToken.value !== Symbols.ARGLIST_END) {
                    return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, userFuncRrbToken);
                }
                const userFuncNoArgEolToken = line.dequeue()!;
                if (userFuncNoArgEolToken.tokenType === TokenType.EOF) {
                    return syntaxError("ここでソースコードの末尾は不正です.", userFuncNoArgEolToken);
                } else if (userFuncNoArgEolToken.tokenType !== TokenType.EOL) {
                    return syntaxError("不正な文字(あるいは文字列)です.", userFuncNoArgEolToken);
                }
                const userFuncNoArgCode = new C.CallUserFunc(src, userFunc, []);
                this.#env.addCode(userFuncNoArgCode);
                this.#env.findName(funcName)!.incrementCounter();
                log.dump("src", Token.lineToString, src);
                log.debug("PARSED call. [no arg user func]");
                return Result.ok(undefined);
            }
            
            const userFuncArgs: C.Expr[] = [];

            for (let i = 0; i < userFunc.retArg.args.length; i++) {
                const userFuncArgToken = line.front;

                const userFuncArgRes = this.#parseExprTokens(line, src);
                if (userFuncArgRes.isErr) {
                    return Result.err(userFuncArgRes.error);
                }
                const userFuncArg = userFuncArgRes.result;
                userFuncArgs.push(userFuncArg);

                log.dump("userFuncArg", userFuncArg);

                if (C.inferVtype(userFunc.retArg.args[i], userFuncArg.vtype).isErr) {
                    return syntaxError(`ユーザ関数${funcNameToken.value}の${i+1}番目の引数の型が不一致です.`, userFuncArgToken);
                }

                const userFuncSymToken = line.dequeue()!;
                src.push(userFuncSymToken);
                
                if (i + 1 < userFunc.retArg.args.length) {
                    if (userFuncSymToken.value !== Symbols.ARGLIST_DELIMITER) {
                        return syntaxError(`記号 ${Symbols.ARGLIST_DELIMITER} が必要です.`, userFuncSymToken);
                    }
                } else if (userFuncSymToken.value !== Symbols.ARGLIST_END) {
                    return syntaxError(`記号 ${Symbols.ARGLIST_END} が必要です.`, userFuncSymToken);
                }
            }

            const userFuncEolToken = line.dequeue()!;
            if (userFuncEolToken.tokenType === TokenType.EOF) {
                return syntaxError("ここでソースコードの末尾は不正です.", userFuncEolToken);
            } else if (userFuncEolToken.tokenType !== TokenType.EOL) {
                return syntaxError("不正な文字(あるいは文字列)です.", userFuncEolToken);
            }

            const userFuncCode = new C.CallUserFunc(src, userFunc, userFuncArgs);
            this.#env.addCode(userFuncCode);

            this.#env.findName(funcName)!.incrementCounter();
            
            log.dump("src", Token.lineToString, src);
            log.debug("PARSED call. [user func]");
            return Result.ok(undefined);
        }

        const args: C.Expr[] = [];
        const argTypes: C.Vtype[] = [];

        if (line.front!.value === Symbols.ARGLIST_END) {
            // no arg user func
            src.push(line.dequeue()!);
            const noArgEolToken = line.dequeue()!;
            if (noArgEolToken.tokenType === TokenType.EOF) {
                return syntaxError("ここでソースコードの末尾は不正です.", noArgEolToken);
            } else if (noArgEolToken.tokenType !== TokenType.EOL) {
                return syntaxError("不正な文字(あるいは文字列)です.", noArgEolToken);
            }

            const noArgFuncInfoRes = this.#env.addUserFunc(src, funcName, new C.RetArg(C.Vtype.UNKNOWN, []), false);
            if (noArgFuncInfoRes.isErr) {
                return Result.err(noArgFuncInfoRes.error);
            }
            const noArgFuncInfo = noArgFuncInfoRes.result;

            const noArgCode = new C.CallUserFunc(src, noArgFuncInfo, []);

            this.#env.addCode(noArgCode);
            this.#env.findName(funcName)!.incrementCounter();

            log.dump("src", Token.lineToString, src);
            log.debug("PARSED call. [unknown no arg user func]");

            return Result.ok(undefined);
        }

        while (line.len) {
            const token = line.front;

            const argRes = this.#parseExprTokens(line, src);
            if (argRes.isErr) {
                return Result.err(argRes.error);
            }
            const arg = argRes.result;
            args.push(arg);
            argTypes.push(arg.vtype);

            log.dump("arg", arg);

            const symToken = line.dequeue()!;
            src.push(symToken);

            if (symToken.value === Symbols.ARGLIST_DELIMITER) {
                continue;
            } else if (symToken.value == Symbols.ARGLIST_END) {
                break;
            } else {
                return syntaxError(`記号 ${Symbols.ARGLIST_DELIMITER} または記号 ${Symbols.ARGLIST_END} が必要です.`, symToken);
            }
        }

        const eolToken = line.dequeue()!;
        if (eolToken.tokenType === TokenType.EOF) {
            return syntaxError("ここでソースコードの末尾は不正です.", eolToken);
        } else if (eolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字(あるいは文字列)です.", eolToken);
        }

        const retArg = new C.RetArg(C.Vtype.UNKNOWN, argTypes);

        const funcInfoRes = this.#env.addUserFunc(src, funcName, retArg, false);
        if (funcInfoRes.isErr) {
            return Result.err(funcInfoRes.error);
        }
        const funcInfo = funcInfoRes.result;

        const code = new C.CallUserFunc(src, funcInfo, args);

        this.#env.addCode(code);

        this.#env.findName(funcName)!.incrementCounter();

        log.dump("src", Token.lineToString, src);

        log.debug("PARSED call. [unknown user func]");

        return Result.ok(undefined);
    }

    #parsePrint(line: RQueue<Token>): Result<undefined,ParserError> {
        const printToken = line.dequeue()!;
        const src: Token[] = [printToken];

        log.debug("PARSE print...");

        const args: C.Expr[] = [];

        while (line.len) {
            const token = line.front;

            const argRes = this.#parseExprTokens(line, src);
            if (argRes.isErr) {
                return syntaxError(argRes.error, token);
            }
            const arg = argRes.result;
            args.push(arg);

            log.dump("arg", arg);

            if (C.inferVtype(arg.vtype, C.Vtype.INFER_PRIMITIVE).isErr) {
                return syntaxError(`${Keyword.PRINT}にはプリミティブ型(${[Keyword.BOOLEAN,Keyword.FLOAT,Keyword.INTEGER,Keyword.STRING].join("/")})のみ渡せます.`, token);
            }

            const commaToken = line.dequeue()!;
            src.push(commaToken);

            if (commaToken.tokenType === TokenType.EOF) {
                return syntaxError("ここでソースコードの末尾は不正です.", commaToken);
            } else if (commaToken.tokenType === TokenType.EOL) {
                break;
            } else if (commaToken.value !== Symbols.PRINT_DELIMITER) {
                return syntaxError(`記号 ${Symbols.PRINT_DELIMITER} が必要です.`, commaToken);
            }
        }

        const code = new C.Print(src, args);
        this.#env.addCode(code);

        log.dump("src", Token.lineToString, src);

        log.debug("PARSED print.");
        
        return Result.ok(undefined);
    }

    #parseDoWhile(line: RQueue<Token>): Result<undefined,ParserError> {
        const doToken = line.dequeue()!;
        const src: Token[] = [doToken];

        log.debug("PARSE do...");

        // DOのみで無限ループ、UNTIL、後置WHILE、いずれも想定してない.
        // 前置WHILE の DO WHILE expr のみを想定.

        const whileToken = line.dequeue()!;
        src.push(whileToken);

        if (whileToken.value.toLowerCase() !== Keyword.WHILE) {
            return syntaxError(`キーワード"${Keyword.WHILE}"が必要です.`, whileToken);
        }

        const testExprToken = line.front;

        const testExprRes = this.#parseExprTokens(line, src);
        if (testExprRes.isErr) {
            return Result.err(testExprRes.error);
        }
        const testExpr = testExprRes.result;

        log.dump("testExpr", testExpr);

        if (C.inferVtype(testExpr.vtype, C.Vtype.BOOLEAN).isErr) {
            return syntaxError(`条件文は真偽値型(${Keyword.BOOLEAN})の式が必要です.`, testExprToken);
        }

        const eolToken = line.dequeue()!;
        if (eolToken.tokenType === TokenType.EOF) {
            return syntaxError("ここでソースコードの末尾は不正です.", eolToken);
        } else if (eolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字(あるいは文字列)です.", eolToken);
        }

        log.dump("src", Token.lineToString, src);

        this.#env.push(src, true);

        const blockRes = this.#parseCodeBlock();
        if (blockRes.isErr) {
            return Result.err(blockRes.error);
        }
        const lastLine = blockRes.result.lastLine;

        const endToken = lastLine.dequeue()!;
        if (endToken.value.toLowerCase() !== Keyword.END) {
            return syntaxError(`"${Keyword.END} ${Keyword.DO}"が必要です.`, endToken);
        }
        const endDoToken = lastLine.dequeue()!;
        if (endDoToken.value.toLowerCase() !== Keyword.DO) {
            return syntaxError(`"${Keyword.END} ${Keyword.DO}"が必要です.`, endToken);
        }
        const endDoEolToken = lastLine.dequeue()!;
        if (endDoEolToken.tokenType === TokenType.EOF) {
            return syntaxError("ここでソースコードの末尾は不正です.", endDoEolToken);
        } else if (endDoEolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字(あるいは文字列)です.", endDoEolToken);
        }

        const blockInfo = this.#env.pop();

        const code = new C.DoWhile(src, testExpr, blockInfo);

        this.#env.addCode(code);

        if (blockInfo.blockEnd & C.BlockEndKind.RETURN) {
            // 条件次第ではループ内が1回も実行されない場合がありend do以降はデッドコードにはならない.
            // this.#env.setBlockEnd(C.BlockEndKind.RETURN);
        }

        log.debug("PARSED do.");

        return Result.ok(undefined);
    }

    #parseFunc(line: RQueue<Token>): Result<undefined,ParserError> {
        const funcToken = line.dequeue()!;
        const src: Token[] = [funcToken];

        log.debug("PARSE func...");

        if (!this.#env.isToplevel) {
            return syntaxError(`${Keyword.FUNC}はトップレベルでのみ使用できます.`, funcToken);
        }

        const funcNameToken = line.dequeue()!;
        src.push(funcNameToken);

        log.dump("funcName", funcNameToken.value);

        if (funcNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("ユーザ関数名が必要です.", funcNameToken);
        }

        const funcName = funcNameToken.value.toLowerCase();
 
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

        const funcAsToken = line.dequeue()!;
        src.push(funcAsToken);

        if (funcAsToken.value.toLowerCase() !== Keyword.AS) {
            return syntaxError(`キーワード"${Keyword.AS}"が必要です.`, funcAsToken);
        }

        const retTypeToken = line.dequeue()!;
        src.push(retTypeToken);

        let retType: C.Vtype;

        switch (retTypeToken.value.toLowerCase()) {
            case Keyword.BOOLEAN:
                retType = C.Vtype.BOOLEAN;
                break;
            case Keyword.FLOAT:
                retType = C.Vtype.FLOATING_POINT;
                break;
            case Keyword.INTEGER:
                retType = C.Vtype.INTEGER;
                break;
            case Keyword.STRING:
                retType = C.Vtype.STRING;
                break;
            default:
                return syntaxError(`型名(${[Keyword.BOOLEAN,Keyword.FLOAT,Keyword.INTEGER,Keyword.STRING].join("/")})が必要です.`,retTypeToken);
        }

        const eolToken = line.dequeue()!;
        if (eolToken.tokenType === TokenType.EOF) {
            return syntaxError(`対となる"${Keyword.END} ${Keyword.FUNC}"が必要です.`, eolToken);
        }
        if (eolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字です.", eolToken);
        }

        const retArg = new C.RetArg(retType, argTypes);

        const funcInfoRes = this.#env.addUserFunc(src, funcName, retArg, true, argNames);
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
            return syntaxError(`ブロックは"${Keyword.END} ${Keyword.FUNC}"で終了する必要があります.`, endToken);
        }
        
        const endSubToken = lastLine.dequeue()!;
        if (endSubToken.value.toLowerCase() !== Keyword.FUNC) {
            return syntaxError(`ブロックは"${Keyword.END} ${Keyword.FUNC}"で終了する必要があります.`, endToken);
        }

        if (lastLine.len > 1) {
            return syntaxError("不正な文字(あるいは文字列)です.", lastLine.front);
        }

        const innerBlockInfo = this.#env.pop();

        const innerCode = new C.Block(innerBlockInfo);

        this.#env.addCode(innerCode);

        const outerBlockInfo = this.#env.pop();

        const defineUserFuncCode = new C.DefineUserFunc(funcInfo, outerBlockInfo);

        this.#env.addCode(defineUserFuncCode);

        log.debug("PARSED func.");

        return Result.ok(undefined);
    }

    #parseBreak(line: RQueue<Token>): Result<undefined,ParserError> {
        const breakToken = line.dequeue()!;
        const src: Token[] = [breakToken];

        log.debug("PARSE break...");

        const eolToken = line.dequeue()!;
        if (eolToken.tokenType === TokenType.EOF) {
            return syntaxError("ここでソースコードの末尾は不正です.", eolToken);
        } else if (eolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字(あるいは文字列)です.", eolToken);
        }

        const blockSummary = this.#env.findLoopTrapBlock();
        if (blockSummary === undefined) {
            return syntaxError("対応するループが見つかりません.", breakToken);
        }
        U.assert(blockSummary.blockSrc !== null);

        log.dump("loopBlockId", blockSummary.blockId);
        log.dump("loopBlockSrc", Token.lineToString, blockSummary.blockSrc);

        const code = new C.Break(src, blockSummary.blockId, blockSummary.blockSrc);

        this.#env.addCode(code);

        this.#env.setBlockEnd(C.BlockEndKind.BREAK);

        log.dump("src", Token.lineToString, src);

        log.debug("PARSED break.");
        
        return Result.ok(undefined);
    }

    #parseContinue(line: RQueue<Token>): Result<undefined,ParserError> {
        const continueToken = line.dequeue()!;
        const src: Token[] = [continueToken];

        log.debug("PARSE continue...");

        const eolToken = line.dequeue()!;
        if (eolToken.tokenType === TokenType.EOF) {
            return syntaxError("ここでソースコードの末尾は不正です.", eolToken);
        } else if (eolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字(あるいは文字列)です.", eolToken);
        }

        const blockSummary = this.#env.findLoopTrapBlock();
        if (blockSummary === undefined) {
            return syntaxError("対応するループが見つかりません.", continueToken);
        }
        U.assert(blockSummary.blockSrc !== null);

        log.dump("loopBlockId", blockSummary.blockId);
        log.dump("loopBlockSrc", Token.lineToString, blockSummary.blockSrc);

        const code = new C.Continue(src, blockSummary.blockId, blockSummary.blockSrc);

        this.#env.addCode(code);

        this.#env.setBlockEnd(C.BlockEndKind.CONTINUE);

        log.dump("src", Token.lineToString, src);

        log.debug("PARSED continue.");
        
        return Result.ok(undefined);
    }

    #parseReturn(line: RQueue<Token>): Result<undefined,ParserError> {
        const returnToken = line.dequeue()!;
        const src: Token[] = [returnToken];

        log.debug("PARSE return...");

        const funcInfo = this.#env.definitionUserFunc;

        const retType = funcInfo.retArg.ret;

        if (retType === C.Vtype.VOID) {
            const subEolToken = line.dequeue()!;
            if (subEolToken.tokenType === TokenType.EOF) {
                return syntaxError("ここでソースコードの末尾は不正です.", subEolToken);
            } else if (subEolToken.tokenType !== TokenType.EOL) {
                return syntaxError("不正な文字(あるいは文字列)です.", subEolToken);
            }
            const subReturnCode = new C.Return(src, funcInfo);
            this.#env.addCode(subReturnCode);
            this.#env.setBlockEnd(C.BlockEndKind.RETURN);
            log.dump("src", Token.lineToString, src);
            log.debug("PARSED return. [sub]");
            return Result.ok(undefined);
        }

        const returnValueToken = line.front;

        const returnValueRes = this.#parseExprTokens(line, src);
        if (returnValueRes.isErr) {
            return Result.err(returnValueRes.error);
        }
        const returnValue = returnValueRes.result;

        log.dump("returnValue", returnValue);

        if (C.inferVtype(returnValue.vtype, retType).isErr) {
            return syntaxError("戻り値の型が不一致です.", returnToken);
        }

        const funcEolToken = line.dequeue()!;
        if (funcEolToken.tokenType === TokenType.EOF) {
            return syntaxError("ここでソースコードの末尾は不正です.", funcEolToken);
        } else if (funcEolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字(あるいは文字列)です.", funcEolToken);
        }

        log.dump("src", Token.lineToString, src);

        const funcReturnCode = new C.Return(src, funcInfo, returnValue);

        this.#env.addCode(funcReturnCode);

        this.#env.setBlockEnd(C.BlockEndKind.RETURN);

        log.debug("PARSED return. [func]");
        
        return Result.ok(undefined);
    }
}

export default Parser;
