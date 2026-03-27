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
const StdFuncWordMap = Object.freeze(new Map([
    ["cbool", [C.Vtype.BOOLEAN, [C.Vtype.INFER_PRIMITIVE]]],
    ["cfloat", [C.Vtype.FLOATING_POINT, [C.Vtype.INFER_PRIMITIVE]]],
    ["cint", [C.Vtype.INTEGER, [C.Vtype.INFER_PRIMITIVE]]],
    ["cstr", [C.Vtype.STRING, [C.Vtype.INFER_PRIMITIVE]]],
    ["abs", [C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER]]],
    ["sign", [C.Vtype.INFER_NUMBER, [C.Vtype.INFER_NUMBER]]],
    ["cos", [C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]]],
    ["sin", [C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]]],
    ["tan", [C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]]],
    ["pow", [C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]]],
    ["sqrt", [C.Vtype.FLOATING_POINT, [C.Vtype.FLOATING_POINT]]],
    ["floor", [C.Vtype.INTEGER, [C.Vtype.FLOATING_POINT]]],
    ["ceil", [C.Vtype.INTEGER, [C.Vtype.FLOATING_POINT]]]
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
    #nameMapStack = [];
    #codeBodyStack = [];
    #totalBlockCount = 0;
    #totalVarCount = 0;
    constructor() { }
    reset() {
        this.#totalBlockCount = 0;
        this.#nameMapStack = [];
        this.#codeBodyStack = [];
        this.#totalVarCount = 0;
    }
    get isGlobal() {
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
        for (let i = 1; i <= this.#nameMapStack.length; i++) {
            const nameMap = this.#nameMapStack.at(-i);
            if (nameMap.has(name)) {
                return nameMap.get(name);
            }
        }
        return undefined;
    }
    hasName(name) {
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
        throw new Error("unimplemented error");
    }
}
export default Parser;
