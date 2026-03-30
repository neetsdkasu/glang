//
// Parser
//
import Logger, { LogLevel } from "logger";
const log = new Logger("parser", LogLevel.ALL);
import { TokenType } from "scanner";
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
    "call",
    "continue",
    "dim",
    "do",
    "else",
    "end",
    "for",
    "func",
    "if",
    "let",
    "return",
    "step",
    "sub",
    "then",
    "to",
    "while",
    "byval",
    "byref",
    "ref",
    "true",
    "false",
    "boolean",
    "float",
    "integer",
    "string",
    "main"
]));
class FuncRetArg {
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
        if (this.ret & C.Vtype.INFER) {
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
            if (ta & C.Vtype.INFER) {
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
}
;
/**
 * 標準関数
 */
const StdFuncWordMap = Object.freeze(new Map([
    ["cbool", new FuncRetArg(C.Vtype.BOOLEAN, [C.Vtype.INFER_PRIMITIVE])],
    ["cfloat", new FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.INFER_PRIMITIVE])],
    ["cint", new FuncRetArg(C.Vtype.INTEGER, [C.Vtype.INFER_PRIMITIVE])],
    ["cstr", new FuncRetArg(C.Vtype.STRING, [C.Vtype.INFER_PRIMITIVE])],
    ["abs", new FuncRetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER])],
    ["sign", new FuncRetArg(C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER])],
    ["cos", new FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["sin", new FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["tan", new FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["pow", new FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["sqrt", new FuncRetArg(C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT])],
    ["floor", new FuncRetArg(C.Vtype.INTEGER, [C.Vtype.FLOATING_POINT])],
    ["ceil", new FuncRetArg(C.Vtype.INTEGER, [C.Vtype.FLOATING_POINT])]
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
class FuncInfo {
    src;
    name;
    retArg;
    varId;
    definition;
    constructor(src, name, retArg, varId, definition) {
        this.src = src;
        this.name = name;
        this.retArg = retArg;
        this.varId = varId;
        this.definition = definition;
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
        return `FuncInfo{ src: ${this.src}, name: ${this.name}, retArg: ${this.retArg}, varId: ${this.varId}, definition: ${this.definition} }`;
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
        this.#nameMapStack.push(new NameMap(this.#newBlockId(), blockSrc));
        this.#codeBodyStack.push([]);
    }
    /**
     * 最深ブロックを取り除きます.
     *
     * @returns
     */
    pop() {
        if (this.#codeBodyStack.length === 0) {
            return Result.err("no block");
        }
        const map = this.#nameMapStack.pop();
        const body = this.#codeBodyStack.pop();
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
     * ブロック末尾にコードを追加します.
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
     * @returns
     */
    setUserFunc(src, name, retArg, definition) {
        name = name.toLowerCase();
        if (ReservedWordSet.has(name)) {
            if (name !== "main") {
                return syntaxError(`ユーザ関数名に予約語は使用できません. "${name}"`, src);
            }
            else if (retArg.checkConsistencyWith(new FuncRetArg(C.Vtype.VOID, [])).isErr) {
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
        const funcInfo = new FuncInfo(src, name, retArg, varId, definition);
        const current = this.#userFuncMap.get(name);
        if (current) {
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
            if (definition) {
                this.#userFuncMap.set(name, funcInfo);
            }
        }
        else {
            this.#userFuncMap.set(name, funcInfo);
        }
        return Result.ok(funcInfo);
    }
}
export class Parser {
    #scanner;
    #env = new Env();
    #scanError = undefined; // #scanのエラー保持.
    #scanToken = undefined; // #scanのトークン保持.
    #noMoreTokens = false; // #scanでソースコード終端到達.
    constructor(scanner) {
        this.#scanner = scanner;
    }
    /**
     * #scanner.scan()の呼び出し代行します.
     * エラーの場合#scanErrorにエラーを設定します.
     * 引数msgを受け取った場合、ソースコード終端到達をエラー扱いにし、msgをエラーメッセージとします.
     * ソースコード終端末尾到達で#noMoreTokensをtrueに設定します.
     *
     * @param msg
     * @returns trueならエラー発生なし, falseならエラー発生あり.
     */
    #scan(msg) {
        const res = this.#scanner.scan();
        this.#scanToken = this.#scanner.token;
        if (res.isErr) {
            this.#scanError = Result.err(res.error);
            return false;
        }
        else if (!res.result) {
            this.#noMoreTokens = true;
            if (msg !== undefined) {
                this.#scanError = syntaxError(msg, this.#scanner);
                return false;
            }
        }
        else {
            this.#scanError = undefined;
        }
        return true;
    }
    #getScanToken() {
        if (this.#scanToken) {
            return this.#scanToken;
        }
        else {
            throw new Error("BUG: 不正な呼び出し.");
        }
    }
    #getScanError() {
        if (this.#scanError) {
            return Result.err(this.#scanError?.error);
        }
        else {
            throw new Error("BUG: 不正な呼び出し.");
        }
    }
    #isNoMoreTokens() {
        return this.#noMoreTokens;
    }
    parse() {
        this.#env.reset();
        this.#env.push(null);
        while (true) {
            if (!this.#scan()) {
                return this.#getScanError();
            }
            if (this.#isNoMoreTokens()) {
                break;
            }
            const cmdToken = this.#getScanToken();
            log.dump("cmdToken", cmdToken);
            if (cmdToken.tokenType !== TokenType.WORD) {
                return syntaxError("行頭に使用できない文字/文字列です.", cmdToken);
            }
            let res;
            switch (cmdToken.value.toLowerCase()) {
                case "dim":
                    res = this.#parseDim(cmdToken);
                    break;
                case "sub":
                    res = this.#parseSub(cmdToken);
                    break;
                default:
                    throw new Unimplemented(cmdToken);
            }
            if (res.isErr) {
                return Result.err(res.error);
            }
        }
        const mainSub = this.#env.findUserFunc("main");
        if (mainSub === undefined || !mainSub.definition) {
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
    #parseDim(dimToken) {
        const src = [dimToken];
        log.info("parse dim...");
        if (!this.#scan("配列名を指定してください.")) {
            return this.#getScanError();
        }
        const arrNameToken = this.#getScanToken();
        src.push(arrNameToken);
        const arrName = arrNameToken.value.toLowerCase();
        log.dump("arrName", arrName);
        if (arrNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("この位置では配列名以外は不正です.", arrNameToken);
        }
        if (!this.#scan("配列の次元指定を開始するための開き丸括弧が必要です.")) {
            return this.#getScanError();
        }
        const lbrToken = this.#getScanToken();
        src.push(lbrToken);
        if (lbrToken.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            return syntaxError("この位置では配列の次元指定を開始するための開き丸括弧以外は不正です.", this.#scanner);
        }
        let dims = [];
        let dm = 1;
        while (true) {
            if (!this.#scan()) {
                return this.#getScanError();
            }
            if (this.#isNoMoreTokens()) {
                break;
            }
            const sizeToken = this.#scanner.token;
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
                    return syntaxError("この位置では正の整数リテラルによる次元サイズ以外は不正です.", sizeToken);
            }
            if (!this.#scan("閉じ丸括弧またはカンマが必要です.")) {
                return this.#getScanError();
            }
            const symToken = this.#getScanToken();
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
                return syntaxError("この位置では閉じ丸括弧とカンマ以外は不正です.", symToken);
            }
        }
        log.dump("dims", dims);
        if (!this.#scan("キーワード`as`が必要です.")) {
            return this.#getScanError();
        }
        const asToken = this.#getScanToken();
        src.push(asToken);
        if (asToken.value.toLowerCase() !== "as") {
            return syntaxError("この位置ではキーワード`as`以外は不正です.", asToken);
        }
        if (!this.#scan("型名(boolean/float/integer/string)を指定してください")) {
            return this.#getScanError();
        }
        const typeToken = this.#getScanToken();
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
                return syntaxError("この位置では型名(boolean/float/integer/string)以外は不正です.", typeToken);
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
        if (!this.#scan()) {
            return this.#getScanError();
        }
        if (!this.#isNoMoreTokens()) {
            const endToken = this.#getScanToken();
            // src.push(endToken);
            if (endToken.tokenType !== TokenType.LINE_END) {
                return syntaxError("不正な文字です.", endToken);
            }
        }
        const varInfo = this.#env.addName(dimToken, arrName, vtype);
        if (varInfo.isErr) {
            return Result.err(varInfo.error);
        }
        const code = new C.Dim(src, varInfo.result, dims);
        this.#env.addCode(code);
        log.info("parsed dim.");
        return Result.ok(undefined);
    }
    #parseSub(subToken) {
        const src = [subToken];
        log.info("parse sub...");
        if (!this.#env.isToplevel) {
            return syntaxError("`sub`はトップレベルでのみ使用できます.", subToken);
        }
        if (!this.#scan("ユーザ関数名が必要です.")) {
            return this.#getScanError();
        }
        const subNameToken = this.#getScanToken();
        src.push(subNameToken);
        log.dump("subName", subNameToken.value);
        if (subNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("この位置ではユーザ関数名以外は不正です.", subNameToken);
        }
        const subName = subNameToken.value.toLowerCase();
        if (!this.#scan("開き丸括弧が必要です.")) {
            return this.#getScanError();
        }
        const lrbToken = this.#getScanToken();
        if (lrbToken.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            return syntaxError("この位置では開き丸括弧以外は不正です.", lrbToken);
        }
        throw new Unimplemented(this.#scanner);
    }
}
export default Parser;
