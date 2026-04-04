//
// Parser
//
import Logger, { LogLevel } from "logger";
const log = new Logger("parser", LogLevel.ALL);
import RQueue from "rqueue";
import { Token, TokenType } from "scanner";
import { Result, Unimplemented } from "utils";
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
function syntaxError(msg, obj) {
    return Result.err(`Syntax Error: ${msg} ( ${obj} )`);
}
function boundaryError(msg, obj) {
    return Result.err(`Boundary Error: ${msg} ( ${obj} )`);
}
const ReservedWordSet = Object.freeze(new Set([
    "as",
    "break",
    "case",
    "call",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "defer",
    "dim",
    "do",
    "each",
    "else",
    "end",
    "exit",
    "export",
    "extends",
    "finally",
    "for",
    "foreach",
    "func",
    "if",
    "import",
    "in",
    "interface",
    "let",
    "loop",
    "new",
    "next",
    "out",
    "readonly",
    "ref",
    "return",
    "select",
    "step",
    "sturct",
    "sub",
    "switch",
    "template",
    "then",
    "throw",
    "to",
    "type",
    "until",
    "while",
    "true",
    "false",
    "null",
    "nil",
    "private",
    "public",
    "byval",
    "byref",
    "boolean",
    "float",
    "integer",
    "string",
    "object",
    "main"
]));
/**
 * 標準関数
 */
const StdFuncWordMap = Object.freeze(new Map([
    ["cbool", new C.FuncRetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_PRIMITIVE])],
    ["cfloat", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.INFER_PRIMITIVE])],
    ["cint", new C.FuncRetArg(C.Vtype.INTEGER, [C.Vtype.INFER_PRIMITIVE])],
    ["cstr", new C.FuncRetArg(C.Vtype.STRING, [C.Vtype.INFER_PRIMITIVE])],
    ["abs", new C.FuncRetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER])],
    ["sign", new C.FuncRetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER])],
    ["max", new C.FuncRetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER, C.Vtype.INFER_NUMBER])],
    ["min", new C.FuncRetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER, C.Vtype.INFER_NUMBER])],
    ["cos", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["sin", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["tan", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["pow", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["sqrt", new C.FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["floor", new C.FuncRetArg(C.Vtype.INTEGER, [C.Vtype.FLOATING_POINT])],
    ["ceil", new C.FuncRetArg(C.Vtype.INTEGER, [C.Vtype.FLOATING_POINT])]
]));
const POSITIVE_INTEGER_BOUND = BigInt(0x7FFFFFFF);
const NEGATIVE_INTEGER_BOUND = BigInt(2 ** 31);
log.dump("POSITIVE_INTEGER_BOUND", POSITIVE_INTEGER_BOUND);
log.dump("NEGATIVE_INTEGER_BOUND", NEGATIVE_INTEGER_BOUND);
function parseNumber(token, negative) {
    switch (token.tokenType) {
        case TokenType.INTEGER:
        case TokenType.BIN_INETGER:
        case TokenType.HEX_INTEGER:
            const bi = BigInt(token.value);
            if (negative) {
                if (bi > NEGATIVE_INTEGER_BOUND) {
                    return boundaryError("unexpedted number.", token);
                }
            }
            else if (bi > POSITIVE_INTEGER_BOUND) {
                return boundaryError("unexpedted number.", token);
            }
            return Result.ok(Number(bi));
        case TokenType.FLOATING_POINT:
            const fp = parseFloat(token.value);
            return Result.ok(fp);
        default:
            return Result.err(`BUG: wrong param token of parseNumber. ( ${token.toString()} )`);
    }
}
class NameMap {
    blockId;
    blockSrc;
    #map = new Map();
    constructor(blockId, blockSrc) {
        this.blockId = blockId;
        this.blockSrc = blockSrc;
    }
    #newBlockVarId() {
        return this.#map.size;
    }
    has(name) {
        return this.#map.has(name);
    }
    set(src, name, vtype, varId) {
        const nameInfo = new C.NameInfo(src, name, vtype, varId, this.blockId, this.#newBlockVarId());
        this.#map.set(name, nameInfo);
        return nameInfo;
    }
    get(name) {
        return this.#map.get(name);
    }
}
class Env {
    #nameMapStack = []; // ブロックネストの各ブロックに束縛される名前を管理します(トップレベルのブロックにはユーザ関数名も配置します).
    #codeBodyStack = []; // ブロックネストの各ブロックに置かれるコードリストを管理します.
    #totalBlockCount = 0; // ユニークなブロックIDを生成するために使用します.
    #totalVarCount = 0; // ユニークな変数IDを生成するために使用します.
    #userFuncMap = new Map(); // ユーザ関数の情報を管理します.
    #uniqueNameMap = new Map(); // ユーザ関数名と同名の変数が関数定義前に指定されていることを検出する目的に使用されます.
    constructor() { }
    reset() {
        this.#totalBlockCount = 0;
        this.#nameMapStack = [];
        this.#codeBodyStack = [];
        this.#totalVarCount = 0;
        this.#userFuncMap.clear();
        this.#uniqueNameMap.clear();
    }
    get isToplevel() {
        return this.#nameMapStack.length === 1;
    }
    #newBlockId() {
        return this.#totalBlockCount++;
    }
    #newVarId() {
        return this.#totalVarCount++;
    }
    /**
     * 変数名などを束縛するブロックをブロックネスト最深部に追加します.
     *
     * @param blockSrc ブロックを構築するソースコード情報(func/sub/for/if/elseなど). トップレベルのみnull.
     */
    push(blockSrc) {
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
    pop() {
        log.info("drop block");
        if (this.#codeBodyStack.length === 0) {
            return Result.err("no block");
        }
        const map = this.#nameMapStack.pop();
        const body = this.#codeBodyStack.pop();
        log.dump("block src", Token.lineToString, map.blockSrc ?? []);
        return Result.ok({ blockId: map.blockId, blockSrc: map.blockSrc, body: body });
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
    addName(src, name, vtype) {
        log.info("add name");
        name = name.toLowerCase();
        if (ReservedWordSet.has(name)) {
            return syntaxError(`名前に予約語は使用できません. "${name}"`, src);
        }
        if (StdFuncWordMap.has(name)) {
            return syntaxError(`名前に標準関数名は使用できません. "${name}"`, src);
        }
        for (let i = 1; i <= this.#nameMapStack.length; i++) {
            const nameMap = this.#nameMapStack.at(-i);
            if (nameMap.has(name)) {
                const info = nameMap.get(name);
                if (info.vtype === C.Vtype.SUB || info.vtype === C.Vtype.FUNC) {
                    return syntaxError(`ユーザ関数名との名前の重複はできません(シャドーイングはできない仕様です)."${name}"`, src);
                }
                else {
                    return syntaxError(`ブロックネストのチェーン内で他の名前と重複はできません(シャドーイングはできない仕様です)."${name}"`, src);
                }
            }
        }
        if (!this.#uniqueNameMap.has(name)) {
            this.#uniqueNameMap.set(name, src);
        }
        const current = this.#nameMapStack.at(-1);
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
    findName(name) {
        name = name.toLowerCase();
        for (let i = 1; i <= this.#nameMapStack.length; i++) {
            const nameMap = this.#nameMapStack.at(-i);
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
    hasName(name) {
        name = name.toLowerCase();
        for (let i = 1; i <= this.#nameMapStack.length; i++) {
            const nameMap = this.#nameMapStack.at(-i);
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
    addCode(code) {
        this.#codeBodyStack.at(-1).push(code);
    }
    /**
     * 指定した名前のユーザ関数に関する情報を取得します.
     *
     * @param name
     * @returns
     */
    findUserFunc(name) {
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
    addUserFunc(src, name, retArg, definition, argNames) {
        log.info("add func");
        name = name.toLowerCase();
        if (ReservedWordSet.has(name)) {
            if (name !== "main") {
                return syntaxError(`ユーザ関数名に予約語は使用できません. "${name}"`, src);
            }
            else if (retArg.checkConsistencyWith(new C.FuncRetArg(C.Vtype.VOID, [])).isErr) {
                if (definition) {
                    return syntaxError("main関数は`sub main()`で定義される必要があります.", src);
                }
                else {
                    return syntaxError("main関数は`call main()`で呼び出させれる必要があります.", src);
                }
            }
        }
        if (StdFuncWordMap.has(name)) {
            return syntaxError(`ユーザ関数名に標準関数名は使用できません. "${name}"`, src);
        }
        if (this.#uniqueNameMap.has(name)) {
            const dup = this.#uniqueNameMap.get(name);
            return syntaxError(`ユーザ関数名との名前の重複はできません(シャドーイングはできない仕様です)."${name}"`, dup);
        }
        if (definition) {
            if (argNames === undefined) {
                throw new Error("BUG");
            }
            if (retArg.args.length !== argNames.length) {
                throw new Error("BUG");
            }
            const dup = new Set();
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
        let varId;
        const varInfo = this.#nameMapStack.at(0)?.get(name);
        if (varInfo) {
            if (varInfo.vtype !== C.Vtype.SUB && varInfo.vtype !== C.Vtype.FUNC) {
                // #uniqueNameMapのとこで弾かれているはず.
                log.error("varInfo", varInfo);
                throw new Error("BUG: グローバル変数名でユーザ関数名が使用されています.");
            }
            varId = varInfo.varId;
        }
        else {
            const vtype = retArg.ret === C.Vtype.VOID ? C.Vtype.SUB : C.Vtype.FUNC;
            varId = this.#newVarId();
            this.#nameMapStack.at(0).set(src, name, vtype, varId);
        }
        let argNameAndBlockIds = undefined;
        if (definition) {
            const outerBlockId = this.push(src);
            const args = [];
            for (let i = 0; i < argNames.length; i++) {
                const argRes = this.addName(src, argNames[i], retArg.args[i]);
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
            }
            else if (!defined) {
                funcList.push(funcInfo);
            }
        }
        else {
            this.#userFuncMap.set(name, [funcInfo]);
        }
        log.dump("added func", name);
        return Result.ok(funcInfo);
    }
}
export class Parser {
    #scanner;
    #env = new Env();
    constructor(scanner) {
        this.#scanner = scanner;
    }
    /**
     * 一行分トークンを読み込む.
     * @returns 1個以上のトークンを含むことが保証されるRQueue.末尾のトークンはEOLかEOF.
     */
    #scanLine() {
        const line = [];
        while (true) {
            const res = this.#scanner.scan();
            if (res.isErr) {
                return Result.err(res.error);
            }
            const token = this.#scanner.token;
            line.push(token);
            if (!res.result || token.tokenType === TokenType.EOL || token.tokenType === TokenType.EOF) {
                break;
            }
        }
        return Result.ok(RQueue.wrap(line));
    }
    parse() {
        this.#env.reset();
        this.#env.push(null);
        while (true) {
            const lineRes = this.#scanLine();
            if (lineRes.isErr) {
                return Result.err(lineRes.error);
            }
            const line = lineRes.result;
            const cmdToken = line.front;
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
            let res;
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
                    throw new Unimplemented(line);
            }
            if (res.isErr) {
                return Result.err(res.error);
            }
        }
        const mainSub = this.#env.findUserFunc("main");
        if (mainSub === undefined || !mainSub[0].definition) {
            return Result.err("main関数を定義する必要があります.");
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
    #parseDim(line) {
        const dimToken = line.dequeue();
        const src = [dimToken];
        log.info("parse dim...");
        const arrNameToken = line.dequeue();
        src.push(arrNameToken);
        const arrName = arrNameToken.value.toLowerCase();
        log.dump("arrName", arrName);
        if (arrNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("配列名が必要です.", arrNameToken);
        }
        const lbrToken = line.dequeue();
        src.push(lbrToken);
        if (lbrToken.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            return syntaxError("配列の次元サイズ指定を開始するための開き丸括弧が必要です.", lbrToken);
        }
        let dims = [];
        let dm = 1;
        while (line.len) {
            const sizeToken = line.dequeue();
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
                    log.dump(`d[${dims.length + 1}]`, d);
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
            const symToken = line.dequeue();
            src.push(symToken);
            if (symToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                break;
            }
            else if (symToken.tokenType === TokenType.COMMA) {
                if (dims.length === 3) {
                    return boundaryError("配列の次元は3以下までです.この位置ではカンマは不正です.", symToken);
                }
            }
            else {
                return syntaxError("閉じ丸括弧またはカンマが必要です.", symToken);
            }
        }
        log.dump("dims", dims);
        const asToken = line.dequeue();
        src.push(asToken);
        if (asToken.value.toLowerCase() !== "as") {
            return syntaxError("キーワード`as`が必要です.", asToken);
        }
        const typeToken = line.dequeue();
        src.push(typeToken);
        log.dump("type", typeToken.value);
        let vtype;
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
                vtype |= C.Vtype.ARRAY;
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
        const code = new C.Dim(src, varInfo.result, dims);
        this.#env.addCode(code);
        log.dump("src", Token.lineToString, src);
        log.info("parsed dim.");
        return Result.ok(undefined);
    }
    #parseSub(line) {
        const subToken = line.dequeue();
        const src = [subToken];
        log.info("parse sub...");
        if (!this.#env.isToplevel) {
            return syntaxError("`sub`はトップレベルでのみ使用できます.", subToken);
        }
        const subNameToken = line.dequeue();
        src.push(subNameToken);
        log.dump("subName", subNameToken.value);
        if (subNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("ユーザ関数名が必要です.", subNameToken);
        }
        const subName = subNameToken.value.toLowerCase();
        const lrbToken = line.dequeue();
        src.push(lrbToken);
        if (lrbToken.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            return syntaxError("仮引数定義のための開き丸括弧が必要です.", lrbToken);
        }
        let argTypes = [];
        let argNames = [];
        while (line.len) {
            const argNameToken = line.dequeue();
            src.push(argNameToken);
            if (argTypes.length === 0 && argNameToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                // 引数なしの関数.
                break;
            }
            if (argNameToken.tokenType !== TokenType.WORD) {
                return syntaxError((argTypes.length == ~0 ? "閉じ括弧または" : "") + "仮引数定義が必要です.", argNameToken);
            }
            const argName = argNameToken.value.toLowerCase();
            argNames.push(argName);
            log.dump(`argName[${argNames.length}]`, argName);
            const asToken = line.dequeue();
            src.push(asToken);
            if (asToken.value.toLowerCase() !== "as") {
                return syntaxError("キーワード`as`が必要です.", asToken);
            }
            const argTypeToken = line.dequeue();
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
            const symToken = line.dequeue();
            src.push(symToken);
            if (symToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                break;
            }
            if (symToken.tokenType !== TokenType.COMMA) {
                return syntaxError("カンマまたは閉じ丸括弧が必要です.", symToken);
            }
        }
        const eolToken = line.dequeue();
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
    #parseLet(line) {
        log.info("parse let...");
        throw new Unimplemented(this.#scanner);
    }
}
export default Parser;
