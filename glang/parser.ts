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

const ReservedWordSet: Readonly<Set<string>> = Object.freeze(new Set([
    "abstract",
    "alloc",
    "allocation",
    "allocator",
    "and",
    "array",
    "as",
    "asm",
    "assemble",
    "async",
    "await",
    "base",
    "bool",
    "boolean",
    "break",
    "byref",
    "byval",
    "case",
    "call",
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
    "continue",
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
    "dim",
    "div",
    "do",
    "double",
    "dump",
    "each",
    "else",
    "elseif",
    "elsif",
    "end",
    "enqueue",
    "error",
    "exception",
    "exclude",
    "exit",
    "export",
    "extend",
    "extends",
    "external",
    "false",
    "field",
    "final",
    "finally",
    "float",
    "for",
    "foreach",
    "free",
    "friend",
    "from",
    "fun",
    "func",
    "function",
    "get",
    "global",
    "go",
    "goto",
    "gosub",
    "if",
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
    "integer",
    "interface",
    "internal",
    "lambda",
    "let",
    "local",
    "lock",
    "log",
    "long",
    "loop",
    "macro",
    "main",
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
    "return",
    "sealed",
    "select",
    "self",
    "set",
    "short",
    "single",
    "some",
    "sort",
    "stack",
    "step",
    "string",
    "sturct",
    "sub",
    "super",
    "switch",
    "sync",
    "synchronized",
    "template",
    "then",
    "this",
    "throw",
    "throws",
    "to",
    "true",
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
    "while",
    "write",
    "xor",
    "yield"
]));


/**
 * 標準関数
 */
const StdFuncWordMap: Readonly<Map<string,C.FuncRetArg>> = Object.freeze(new Map([
    ["cbool", new C.FuncRetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_PRIMITIVE])],
    ["cfloat", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.INFER_PRIMITIVE])],
    ["cint", new C.FuncRetArg(C.Vtype.INTEGER, [C.Vtype.INFER_PRIMITIVE])],
    ["cstr", new C.FuncRetArg(C.Vtype.STRING, [C.Vtype.INFER_PRIMITIVE])],
    ["abs", new C.FuncRetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER])],
    ["sign", new C.FuncRetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER])],
    ["max", new C.FuncRetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER,C.Vtype.INFER_NUMBER])],
    ["min", new C.FuncRetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER,C.Vtype.INFER_NUMBER])],
    ["cos", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["sin", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["tan", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["pow", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["sqrt", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["floor", new C.FuncRetArg(C.Vtype.INTEGER, [C.Vtype.FLOATING_POINT])],
    ["ceil", new C.FuncRetArg(C.Vtype.INTEGER, [C.Vtype.FLOATING_POINT])] 
]));

type UnaryOpInfo = Readonly<{ op: C.UnaryOpKind, vtype: C.Vtype }>;

const UnaryOpMap: Readonly<Map<string,UnaryOpInfo>> = Object.freeze(new Map([
    ["+", { op: C.UnaryOpKind.POSITIVE_SIGN, vtype: C.Vtype.NUMBER_TYPE }],
    ["-", { op: C.UnaryOpKind.NEGATIVE_SIGN, vtype: C.Vtype.NUMBER_TYPE }],
    ["~", { op: C.UnaryOpKind.BITWISE_NOT, vtype: C.Vtype.INTEGER }],
    ["!", { op: C.UnaryOpKind.LOGICAL_NOT, vtype: C.Vtype.BOOLEAN }]
]));

const BinaryOpMap: Readonly<Map<string,C.BinaryOpInfo>> = Object.freeze(new Map([
    ["*", new C.BinaryOpInfo(C.BinaryOpKind.MULTIPLY, 100, C.Vtype.INFER_NUMBER)],
    ["/", new C.BinaryOpInfo(C.BinaryOpKind.DIVIDE, 100, C.Vtype.FLOATING_POINT)],
    ["\\", new C.BinaryOpInfo(C.BinaryOpKind.INT_DIVIDE, 100, C.Vtype.INTEGER)],
    ["%", new C.BinaryOpInfo(C.BinaryOpKind.INT_REMINDER, 100, C.Vtype.INTEGER)],
    ["+", new C.BinaryOpInfo(C.BinaryOpKind.ADD, 90, C.Vtype.INFER_CONCAT)],
    ["-", new C.BinaryOpInfo(C.BinaryOpKind.SUBTRACT, 90, C.Vtype.INFER_NUMBER)],
    [">>", new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_ASHIFT_R, 80, C.Vtype.INTEGER)],
    ["<<", new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_ASHIFT_L, 80, C.Vtype.INTEGER)],
    [">>>", new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_LSHIFT_R, 80, C.Vtype.INTEGER)],
    ["<<<", new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_LSHIFT_L, 80, C.Vtype.INTEGER)],
    ["&", new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_AND, 70, C.Vtype.INFER_LOGICAL)],
    ["|", new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_OR, 60, C.Vtype.INFER_LOGICAL)],
    ["^", new C.BinaryOpInfo(C.BinaryOpKind.BITWISE_XOR, 50, C.Vtype.INTEGER)],
    ["==", new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_EQ, 40, C.Vtype.INFER_PRIMITIVE)],
    ["!=", new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_NE, 40, C.Vtype.INFER_PRIMITIVE)],
    [">", new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_GT, 40, C.Vtype.INFER_COMPARE)],
    [">=", new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_GE, 40, C.Vtype.INFER_COMPARE)],
    ["<", new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_LT, 40, C.Vtype.INFER_COMPARE)],
    ["<=", new C.BinaryOpInfo(C.BinaryOpKind.COMPARE_LE, 40, C.Vtype.INFER_COMPARE)],
    ["&&", new C.BinaryOpInfo(C.BinaryOpKind.SHORTCIRCUIT_AND, 30, C.Vtype.BOOLEAN)],
    ["||", new C.BinaryOpInfo(C.BinaryOpKind.SHORTCIRGUIT_OR, 20, C.Vtype.BOOLEAN)]
]));

const AssignOpMap: Readonly<Map<string,C.Vtype>> = Object.freeze(new Map([
    ["=", C.Vtype.INFER_PRIMITIVE],
    ["+=", C.Vtype.INFER_CONCAT],
    ["-=", C.Vtype.INFER_NUMBER],
    ["*=", C.Vtype.INFER_NUMBER],
    ["/=", C.Vtype.FLOATING_POINT],
    ["\\=", C.Vtype.INTEGER],
    ["%=", C.Vtype.INTEGER],
    [">>=", C.Vtype.INTEGER],
    ["<<=", C.Vtype.INTEGER],
    [">>>=", C.Vtype.INTEGER],
    ["<<<=", C.Vtype.INTEGER],
    ["&=", C.Vtype.INFER_LOGICAL],
    ["|=", C.Vtype.INFER_LOGICAL],
    ["^=", C.Vtype.INFER_LOGICAL]
]));

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
    pop(): Result<{blockId: number, blockSrc: Token[]|null, body: C.Code[]},string> {
        log.info("drop block");
        if (this.#codeBodyStack.length === 0) {
            return Result.err("no block");
        }
        const map = this.#nameMapStack.pop()!;
        const body = this.#codeBodyStack.pop()!;
        log.dump("block src", Token.lineToString, map.blockSrc ?? []);
        return Result.ok({blockId:map.blockId, blockSrc: map.blockSrc, body: body});
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
    addUserFunc(src: Token[], name: string, retArg: C.FuncRetArg, definition: boolean, argNames?: string[] | undefined): Result<C.FuncInfo,string> {
        log.info("add func");
        name = name.toLowerCase();
        if (ReservedWordSet.has(name)) {
            if (name !== "main") {
                return syntaxError(`ユーザ関数名に予約語は使用できません. "${name}"`, src);
            } else if (retArg.checkConsistencyWith(new C.FuncRetArg(C.Vtype.VOID, [])).isErr) {
                if (definition) {
                    return syntaxError("main関数は`sub main()`で定義される必要があります.", src);
                } else {
                    return syntaxError("main関数は`call main()`で呼び出させれる必要があります.", src);
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

    parse(): Result<C.Code[],string> {
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

            switch (cmdToken.value.toLowerCase()) {
                case "dim":
                    res = this.#parseDim(line);
                    break;
                case "let":
                    res = this.#parseLet(line);
                    break;
                case "sub":
                    res = this.#parseSub(line);
                    break;
                default:
                    throw new Unimplemented(line.front);
            }

            if (res.isErr) {
                return Result.err(res.error);
            }
        }

        const mainSub = this.#env.findUserFunc("main");
        if (mainSub === undefined || !mainSub[0].definition) {
            return Result.err("main関数を定義する必要があります.")
        }

        if (!this.#env.isToplevel) {
            // ブロックが閉じておらずendが足りてない
            throw new Unimplemented();
        }

        const code = this.#env.pop();
        if (code.isErr) {
            return Result.err(code.error);
        }

        log.info("done");

        return Result.ok(code.result.body);
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

        if (lrbToken.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            return syntaxError("配列の次元サイズ指定を開始するための開き丸括弧が必要です.",lrbToken);
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

            if (symToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                break;
            } else if (symToken.tokenType === TokenType.COMMA) {
                if (dims.length === 3) {
                    return boundaryError("配列の次元は3以下までです.この位置ではカンマは不正です.", symToken);
                }
            } else {
                return syntaxError("閉じ丸括弧またはカンマが必要です.", symToken);
            }
        }

        log.dump("dims", dims);

        const asToken = line.dequeue()!;
        src.push(asToken);

        if (asToken.value.toLowerCase() !== "as") {
            return syntaxError("キーワード`as`が必要です.", asToken);
        }

        const typeToken = line.dequeue()!;
        src.push(typeToken);

        log.dump("type", typeToken.value);

        let vtype: C.Vtype;

        switch (typeToken.value.toLowerCase()) {
            case "boolean":
                vtype = C.Vtype.BOOLEAN;
                break;
            case "float":
                vtype = C.Vtype.FLOATING_POINT;
                break;
            case "integer":
                vtype = C.Vtype.INTEGER;
                break;
            case "string":
                vtype = C.Vtype.STRING;
                break;
            default:
                return syntaxError("型名(boolean/float/integer/string)が必要です.", typeToken);
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
            return syntaxError("`sub`はトップレベルでのみ使用できます.", subToken);
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

        if (lrbToken.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            return syntaxError("仮引数定義のための開き丸括弧が必要です.", lrbToken);
        }

        let argTypes: C.Vtype[] = [];
        let argNames: string[] = [];

        while (line.len) {
            const argNameToken = line.dequeue()!;
            src.push(argNameToken);

            if (argTypes.length === 0 && argNameToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                // 引数なしの関数.
                break;
            }
            if (argNameToken.tokenType !== TokenType.WORD) {
                return syntaxError((argTypes.length ==~ 0 ? "閉じ括弧または" : "") + "仮引数定義が必要です.", argNameToken);
            }
            const argName = argNameToken.value.toLowerCase();
            argNames.push(argName);

            log.dump(`argName[${argNames.length}]`, argName);

            const asToken = line.dequeue()!;
            src.push(asToken);

            if (asToken.value.toLowerCase() !== "as") {
                return syntaxError("キーワード`as`が必要です.", asToken);
            }

            const argTypeToken = line.dequeue()!;
            src.push(argTypeToken);

            const argType = argTypeToken.value.toLowerCase();
            switch (argType) {
                case "boolean":
                    argTypes.push(C.Vtype.BOOLEAN);
                    break;
                case "float":
                    argTypes.push(C.Vtype.FLOATING_POINT);
                    break;
                case "integer":
                    argTypes.push(C.Vtype.INTEGER);
                    break;
                case "string":
                    argTypes.push(C.Vtype.STRING);
                    break;
                default:
                    return syntaxError("型名(boolean/float/integer/string)が必要です.", argTypeToken);
            }

            log.dump(`argType[${argTypes.length}]`, argType);

            const symToken = line.dequeue()!;
            src.push(symToken);
            if (symToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                break;
            }
            if (symToken.tokenType !== TokenType.COMMA) {
                return syntaxError("カンマまたは閉じ丸括弧が必要です.", symToken);
            }
        }

        const eolToken = line.dequeue()!;
        if (eolToken.tokenType === TokenType.EOF) {
            return syntaxError("対となる`end sub`が必要です.", eolToken);
        }
        if (eolToken.tokenType !== TokenType.EOL) {
            return syntaxError("不正な文字です.", eolToken);
        }

        const retArg = new C.FuncRetArg(C.Vtype.VOID, argTypes);

        const res = this.#env.addUserFunc(src, subName, retArg, true, argNames);
        if (res.isErr) {
            return Result.err(res.error);
        }

        log.dump("func info", res.result);

        log.dump("src", Token.lineToString, src);
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

        if (eqToken.value !== "=") {
            return syntaxError("記号`=`が必要です.", eqToken);
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

            const opToken = line.dequeue()!;
            log.dump("opToken", opToken.value);

            const op = opToken.value.toLowerCase();
            
            if (!BinaryOpMap.has(op)) {
                line.recover();
                break;
            }

            const opInfo = BinaryOpMap.get(op)!;

            while (ops.length > 0 && ops.at(-1)!.op.priority >= opInfo.priority) {
                U.assertGE(terms.length, 2);
                const opX = ops.pop()!;
                const termR = terms.pop()!;
                const termL = terms.pop()!;
                const vtypeXRes = C.inferVtype(opX.op.vtype, termL.vtype, termR.vtype);
                if (vtypeXRes.isErr) {
                    return syntaxError("オペランドの型と演算子が対応してません.", opX.src);
                }
                const vtypeX = vtypeXRes.result;
                const termX = new C.ExprBinOp(opX.src, vtypeX, opX.op, termL, termR);
                terms.push(termX);
            }

            ops.push({ src: opToken, op: opInfo });
        }

        while (ops.length > 0) {
            U.assertGE(terms.length, 2);
            const opX = ops.pop()!;
            const termR = terms.pop()!;
            const termL = terms.pop()!;
            const vtypeXRes = C.inferVtype(opX.op.vtype, termL.vtype, termR.vtype);
            if (vtypeXRes.isErr) {
                return syntaxError("オペランドの型と演算子が対応してません.", opX.src);
            }
            const vtypeX = vtypeXRes.result;
            const termX = new C.ExprBinOp(opX.src, vtypeX, opX.op, termL, termR);
            terms.push(termX);
        }

        U.assertEq(terms.length, 1);
       
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
                    return syntaxError("閉じ丸括弧が必要です.", rrbToken);
                }
                return Result.ok(new C.ExprBracket(token, expr, rrbToken));
            case TokenType.WORD:
                const word = token.value.toLowerCase();
                if (ReservedWordSet.has(word)) {
                    switch (word) {
                        case "true":
                            return Result.ok(new C.ExprLitBoolean(token, true));
                        case "false":
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
                    return syntaxError("ここで戻り値のない`sub`定義のユーザ関数は呼べません.", token);
                } else if (nameInfo.vtype & C.Vtype.FUNC) {
                    line.recover();
                    return this.#parseExprUserFunc(line);
                } else if (nameInfo.vtype & C.Vtype.ARRAY_TYPE) {
                    line.recover();
                    return this.#parseExprArrayVar(line);
                } else {
                    return Result.ok(new C.ExprVar(token, nameInfo));
                }
            default:
                break;
        }

        throw new Unimplemented(token);
    }

    #parseExprUnaryOp(line: RQueue<Token>): Result<C.Expr,string> {
        const opToken = line.dequeue()!;
        const unaryOpInfo = UnaryOpMap.get(opToken.value.toLowerCase())!;
        switch (line.front!.tokenType) {
            case TokenType.INTEGER:
            case TokenType.BIN_INETGER:
            case TokenType.HEX_INTEGER:
                if (C.inferVtype(unaryOpInfo.vtype, C.Vtype.INTEGER).isOk) {
                    const litIntToken = line.dequeue()!;
                    const litIntRes = parseNumber(litIntToken, unaryOpInfo.op);
                    if (litIntRes.isErr) {
                        return Result.err(litIntRes.error);
                    }
                    const litInt = litIntRes.result;
                    log.dump("litInt", litInt);
                    return Result.ok(new C.ExprLitInt(litIntToken, litInt, unaryOpInfo.op));
                } else {
                    return syntaxError(`単項演算子(${unaryOpInfo.op})を適用できない型です.`, line.front);
                }
            case TokenType.FLOATING_POINT:
                if (C.inferVtype(unaryOpInfo.vtype, C.Vtype.FLOATING_POINT).isOk) {
                    const litFloatToken = line.dequeue()!;
                    const litFloatRes = parseNumber(litFloatToken, unaryOpInfo.op);
                    if (litFloatRes.isErr) {
                        return Result.err(litFloatRes.error);
                    }
                    const litFloat = litFloatRes.result;
                    log.dump("litFloat", litFloat);
                    return Result.ok(new C.ExprLitFloat(litFloatToken, litFloat, unaryOpInfo.op));
                } else {
                    return syntaxError(`単項演算子(${unaryOpInfo.op})を適用できない型です.`, line.front);
                }
            case TokenType.WORD:
                if (unaryOpInfo.op === C.UnaryOpKind.LOGICAL_NOT) {
                    switch (line.front!.value.toLowerCase()) {
                        case "true":
                            const trueToken = line.dequeue()!;
                            return Result.ok(new C.ExprLitBoolean(trueToken, !true, unaryOpInfo.op));
                        case "false":
                            const falseToken = line.dequeue()!;
                            return Result.ok(new C.ExprLitBoolean(falseToken, !false, unaryOpInfo.op));
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
            return syntaxError(`単項演算子(${unaryOpInfo.op})を適用でない型です.`, opToken);
        }
        return Result.ok(new C.ExprUnaryOp(opToken, unaryVtypeRes.result, unaryOpInfo.op, termU));
    }

    #parseExprStdFunc(line: RQueue<Token>): Result<C.Expr,string> {
        const nameToken = line.dequeue()!;
        const name = nameToken.value.toLowerCase();
        const retArg = StdFuncWordMap.get(name)!;

        const lrbToken = line.dequeue()!;
        if (lrbToken.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            // 関数型とかあれば参照返すのかなあ…？
            return syntaxError("開き丸括弧が必要です.", lrbToken);
        }

        if (retArg.args.length === 0) {
            // 引数なし関数
            const rrbToken = line.dequeue()!;
            if (rrbToken.tokenType !== TokenType.RIGHT_ROUND_BRACKET) {
                return syntaxError("閉じ丸括弧が必要です.", rrbToken);
            }
            return Result.ok(new C.ExprStdFunc(nameToken, retArg.ret, name, retArg, []));
        }

        const args: C.Expr[] = [];

        for (let i = 0; i < retArg.args.length; i++) {
            const token = line.front;
            const argRes = this.#parseExpr(line);
            if (argRes.isErr) {
                return argRes;
            }
            const arg = argRes.result;
            const argVtypeRes = C.inferVtype(retArg.args[i], arg.vtype);
            if (argVtypeRes.isErr) {
                return syntaxError(`標準関数${name}の${i+1}番目の引数の型が不一致です.`, token);
            }
            args.push(arg);

            const symToken = line.dequeue()!;
            if (i + 1 < retArg.args.length) {
                if (symToken.tokenType !== TokenType.COMMA) {
                    return syntaxError("引数を区切るカンマが必要です.", symToken);
                }
            } else if (symToken.tokenType !== TokenType.RIGHT_ROUND_BRACKET) {
                return syntaxError("閉じ丸括弧が必要です.", symToken);
            }
        }

        let ret: C.Vtype = retArg.ret;
        if (ret & C.Vtype.INFER) {
            for (const arg of args) {
                const retVtypeRes = C.inferVtype(ret, arg.vtype);
                if (retVtypeRes.isErr) {
                    return syntaxError(`標準関数${name}の引数の型は揃える必要があります.`, nameToken);
                }
                ret = retVtypeRes.result;
            }
        }

        return Result.ok(new C.ExprStdFunc(nameToken, ret, name, retArg, args));
    }

    #parseExprUnknownUserFunc(line: RQueue<Token>): Result<C.Expr,string> {
        const nameToken = line.dequeue()!;
        const name = nameToken.value.toLowerCase();

        const lrbToken = line.dequeue()!;
        if (lrbToken.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            return syntaxError(`${nameToken.value}はユーザ関数と判定されたため開き丸括弧が必要です.`, lrbToken);
        }

        if (line.front!.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
            line.dequeue();
            const noArgFuncInfoRes = this.#env.addUserFunc([nameToken], name, new C.FuncRetArg(C.Vtype.INFER_PRIMITIVE, []), false);
            if (noArgFuncInfoRes.isErr) {
                return Result.err(noArgFuncInfoRes.error);
            }
            // TODO

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
            if (symToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                break;
            }
        }



        throw new Unimplemented(line.front);
    }

    #parseExprUserFunc(line: RQueue<Token>): Result<C.Expr,string> {
        throw new Unimplemented(line.front);
    }

    #parseExprArrayVar(line: RQueue<Token>): Result<C.Expr,string> {
        const nameToken = line.dequeue()!;
        const name = nameToken.value.toLowerCase();
        const nameInfo = this.#env.findName(name)!;
        const dim = C.arrayDimension(nameInfo.vtype);

        log.dump("dim", dim);

        const lrbToken = line.dequeue()!;
        if (lrbToken.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            // TODO 配列参照を返す.
            return syntaxError("開き丸括弧が必要です.", lrbToken);
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
                return syntaxError(`配列${nameToken.value}の${i+1}番目の添え字の型が整数型(integer)ではありません.`, token);
            }
            indexes.push(indexTerm);
            
            const symToken = line.dequeue()!;
            if (i + 1 < dim) {
                if (symToken.tokenType !== TokenType.COMMA) {
                    return syntaxError("添え字を区切るカンマが必要です.", symToken);
                }
            } else if (symToken.tokenType !== TokenType.RIGHT_ROUND_BRACKET) {
                return syntaxError("閉じ丸括弧が必要です.", symToken);
            }
        }

        return Result.ok(new C.ExprArrayVar(nameToken, nameInfo, indexes));
    }
}

export default Parser;
