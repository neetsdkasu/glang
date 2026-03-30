//
// Parser
//
import Logger, { LogLevel } from "logger";
const log = new Logger("parser", LogLevel.ALL);
import { TokenType } from "scanner";
import { Result } from "utils";
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
    return Result.err(`Syntax Error: ${msg} ( ${obj.toString()} )`);
}
function boundaryError(msg, obj) {
    return Result.err(`Boundary Error: ${msg} ( ${obj.toString()} )`);
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
    "true",
    "false",
    "boolean",
    "float",
    "integer",
    "string"
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
     * @return ok(false):完全一致(INFERなし). ok(true):一致(INFERが整合). err():不一致で整合性が取れない
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
        const def = this.definition ? this : other; // define
        const cal = this.definition ? other : this; // caller
        return cal.retArg.checkConsistencyWith(def.retArg);
    }
    toString() {
        return `FuncInfo{ src: ${this.src}, name: ${this.name}, retArg: ${this.retArg}, varId: ${this.varId}, definition: ${this.definition} }`;
    }
}
class Env {
    #nameMapStack = [];
    #codeBodyStack = [];
    #totalBlockCount = 0;
    #totalVarCount = 0;
    #userFuncMap = new Map();
    constructor() { }
    reset() {
        this.#totalBlockCount = 0;
        this.#nameMapStack = [];
        this.#codeBodyStack = [];
        this.#totalVarCount = 0;
        this.#userFuncMap.clear();
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
    push(blockSrc) {
        this.#nameMapStack.push(new NameMap(this.#newBlockId(), blockSrc));
        this.#codeBodyStack.push([]);
    }
    pop() {
        if (this.#codeBodyStack.length === 0) {
            return Result.err("no block");
        }
        const map = this.#nameMapStack.pop();
        const body = this.#codeBodyStack.pop();
        return Result.ok({ blockId: map.blockId, blockSrc: map.blockSrc, body: body });
    }
    addName(src, name, vtype) {
        name = name.toLowerCase();
        // 最新のブラウザのJavascriptのArrayにはfindLastがあるらしいが…使ってるtscが古いため…
        for (let i = 1; i <= this.#nameMapStack.length; i++) {
            const nameMap = this.#nameMapStack.at(-i);
            if (nameMap.has(name)) {
                return Result.err(`duplicate name: "${name}"`);
            }
        }
        const current = this.#nameMapStack.at(-1);
        const nameInfo = current.set(src, name, vtype, this.#newVarId());
        return Result.ok(nameInfo);
    }
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
    addCode(code) {
        this.#codeBodyStack.at(-1).push(code);
    }
    findUserFunc(name) {
        return this.#userFuncMap.get(name.toLowerCase());
    }
    setUserFunc(src, name, retArg, definition) {
        name = name.toLowerCase();
        let varId;
        let varInfo = this.#nameMapStack.at(0)?.get(name);
        if (varInfo) {
            varId = varInfo.varId;
        }
        else {
            const vtype = retArg.ret === C.Vtype.VOID ? C.Vtype.SUB : C.Vtype.FUNC;
            varId = this.#newVarId();
            varInfo = this.#nameMapStack.at(0).set(src, name, vtype, varId);
        }
        const funcInfo = new FuncInfo(src, name, retArg, varId, definition);
        const current = this.#userFuncMap.get(name);
        if (current) {
            const validation = current.validate(funcInfo);
            if (validation.isErr) {
                return Result.err(validation.error);
            }
        }
        return Result.ok(funcInfo);
    }
}
export class Parser {
    #scanner;
    #env = new Env();
    constructor(scanner) {
        this.#scanner = scanner;
    }
    parse() {
        this.#env.reset();
        this.#env.push(null);
        while (true) {
            const scanRes = this.#scanner.scan();
            if (scanRes.isErr) {
                return Result.err(scanRes.error);
            }
            if (!scanRes.result) {
                break;
            }
            const cmdToken = this.#scanner.token;
            log.dump("cmdToken", cmdToken.toString());
            if (cmdToken.tokenType !== TokenType.WORD) {
                return syntaxError("illegal first token in line.", cmdToken);
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
                    throw new Error(`unimplemented error. ( ${cmdToken.toString()} )`);
            }
            if (res.isErr) {
                return Result.err(res.error);
            }
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
        let scanRes = this.#scanner.scan();
        if (scanRes.isErr) {
            return Result.err(scanRes.error);
        }
        if (!scanRes.result) {
            return syntaxError("require an array name. [dim]", this.#scanner);
        }
        const arrNameToken = this.#scanner.token;
        src.push(arrNameToken);
        const arrName = arrNameToken.value;
        log.dump("arrName", arrName);
        if (arrNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("require an array name. [dim]", arrNameToken);
        }
        if (ReservedWordSet.has(arrName.toLowerCase())) {
            return syntaxError("wrong array name (reserved keyword). [dim]", arrNameToken);
        }
        if (StdFuncWordMap.has(arrName.toLowerCase())) {
            return syntaxError("wrong array name (same stdfunc name). [dim]", arrNameToken);
        }
        scanRes = this.#scanner.scan();
        if (scanRes.isErr) {
            return Result.err(scanRes.error);
        }
        if (!scanRes.result) {
            return syntaxError("require left round bracket. [dim]", this.#scanner);
        }
        const lbrToken = this.#scanner.token;
        src.push(lbrToken);
        if (lbrToken.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            return syntaxError("require left round bracket. [dim]", this.#scanner);
        }
        let dims = [];
        let dm = 1;
        while (true) {
            scanRes = this.#scanner.scan();
            if (scanRes.isErr) {
                return Result.err(scanRes.error);
            }
            if (!scanRes.result) {
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
                        return boundaryError("dimension size must be positive integer. [dim]", sizeToken);
                    }
                    dm *= d;
                    if (dm > 1e6) {
                        return boundaryError("product of dimension sizes must be less than 1000001. [dim]", sizeToken);
                    }
                    dims.push(d);
                    break;
                default:
                    return syntaxError("require positive integer as dimension size. [dim]", sizeToken);
            }
            scanRes = this.#scanner.scan();
            if (scanRes.isErr) {
                return Result.err(scanRes.error);
            }
            if (!scanRes.result) {
                return syntaxError("require comma or right round bracket. [dim]", this.#scanner);
            }
            const symToken = this.#scanner.token;
            src.push(symToken);
            if (symToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                break;
            }
            else if (symToken.tokenType === TokenType.COMMA) {
                if (dims.length === 3) {
                    return boundaryError("number of dimensions must be less than 4. [dim]", symToken);
                }
            }
            else {
                return syntaxError("require comma or right round bracket. [dim]", symToken);
            }
        }
        log.dump("dims", dims);
        scanRes = this.#scanner.scan();
        if (scanRes.isErr) {
            return Result.err(scanRes.error);
        }
        if (!scanRes.result) {
            return syntaxError("require keyword `as`. [dim]", this.#scanner);
        }
        const asToken = this.#scanner.token;
        src.push(asToken);
        if (asToken.value.toLowerCase() !== "as") {
            return syntaxError("require keyword `as`. [dim]", asToken);
        }
        scanRes = this.#scanner.scan();
        if (scanRes.isErr) {
            return Result.err(scanRes.error);
        }
        if (!scanRes.result) {
            return syntaxError("require type keyword `integer` or `string` or `boolean` or `float`. [dim]", this.#scanner);
        }
        const typeToken = this.#scanner.token;
        src.push(typeToken);
        log.dump("type", typeToken.value.toLowerCase());
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
                return syntaxError("require type keyword `integer` or `string` or `boolean` or `float`. [dim]", typeToken);
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
        scanRes = this.#scanner.scan();
        if (scanRes.isErr) {
            return Result.err(scanRes.error);
        }
        if (scanRes.result) {
            const endToken = this.#scanner.token;
            src.push(endToken);
            if (endToken.tokenType !== TokenType.LINE_END) {
                return syntaxError("unexpected token. [dim]", endToken);
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
            return syntaxError("`sub` is toplevel keyword", subToken);
        }
        let scanRes = this.#scanner.scan();
        if (scanRes.isErr) {
            return Result.err(scanRes.error);
        }
        if (!scanRes.result) {
            return syntaxError("require sub name", this.#scanner);
        }
        const subNameToken = this.#scanner.token;
        src.push(subNameToken);
        log.dump("subName", subNameToken.value);
        if (subNameToken.tokenType !== TokenType.WORD) {
            return syntaxError("require sub name", subNameToken);
        }
        const subName = subNameToken.value;
        if (ReservedWordSet.has(subName.toLowerCase())) {
            return syntaxError("wrong array name (reserved keyword). [sub]", subNameToken);
        }
        if (StdFuncWordMap.has(subName.toLowerCase())) {
            return syntaxError("wrong array name (same stdfunc name). [sub]", subNameToken);
        }
        const nameInfo = this.#env.findName(subName);
        throw new Error("unimplemented error");
    }
}
export default Parser;
