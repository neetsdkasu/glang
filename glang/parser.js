//
// Parser
//
import Logger, { LogLevel } from "logger";
const log = new Logger("parser", LogLevel.ALL);
import { TokenType } from "scanner";
function syntaxError(msg, obj) {
    return `Syntax Error: ${msg} ( ${obj.toString()} )`;
}
function boundaryError(msg, obj) {
    return `Boundary Error: ${msg} ( ${obj.toString()} )`;
}
const ReservedWordSet = Object.freeze(new Set([
    "as",
    "break",
    "continue",
    "dim",
    "do",
    "else",
    "end",
    "for",
    "if",
    "integer",
    "let",
    "return",
    "step",
    "string",
    "sub",
    "then",
    "to",
    "while"
]));
function parseNumber(token) {
    switch (token.tokenType) {
        case TokenType.INTEGER:
            return 2;
        case TokenType.BIN_INETGER:
            return 3;
        case TokenType.HEX_INTEGER:
            return 4;
        case TokenType.FLOATING_POINT:
            return 5;
        default:
            throw `BUG: wrong param token of parseNumber. ( ${token.toString()} )`;
    }
}
export class Parser {
    #scanner;
    constructor(scanner) {
        this.#scanner = scanner;
    }
    parse() {
        if (!this.#scanner.scan()) {
            log.info("no code");
            return;
        }
        const cmdToken = this.#scanner.token;
        log.dump("cmdToken", cmdToken.toString());
        if (cmdToken.tokenType !== TokenType.WORD) {
            throw syntaxError("illegal first token in line.", cmdToken);
        }
        switch (cmdToken.value.toLowerCase()) {
            case "dim":
                this.#parseDim();
                break;
            default:
        }
        log.info("done");
    }
    #parseDim() {
        log.info("parse dim...");
        if (!this.#scanner.scan()) {
            throw syntaxError("require an array name. [dim]", this.#scanner);
        }
        const arrName = this.#scanner.token;
        log.dump("arrName", arrName.value);
        if (arrName.tokenType !== TokenType.WORD) {
            throw syntaxError("require an array name. [dim]", arrName);
        }
        if (ReservedWordSet.has(arrName.value.toLowerCase())) {
            throw syntaxError("wrong array name. [dim]", arrName);
        }
        if (!this.#scanner.scan()) {
            throw syntaxError("require left round bracket. [dim]", this.#scanner);
        }
        if (this.#scanner.token.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            throw syntaxError("require left round bracket. [dim]", this.#scanner);
        }
        let dims = [];
        let dm = 1;
        while (this.#scanner.scan()) {
            const sizeToken = this.#scanner.token;
            switch (sizeToken.tokenType) {
                case TokenType.INTEGER:
                case TokenType.BIN_INETGER:
                case TokenType.HEX_INTEGER:
                    const d = parseNumber(sizeToken);
                    log.dump(`d[${dims.length + 1}]`, d);
                    if (d === 0) {
                        throw boundaryError("dimension size must be positive integer. [dim]", sizeToken);
                    }
                    dm *= d;
                    if (dm > 1e6) {
                        throw boundaryError("product of dimension sizes must be less than 1000001. [dim]", sizeToken);
                    }
                    dims.push(d);
                    break;
                default:
                    throw syntaxError("require positive integer as dimension size. [dim]", sizeToken);
            }
            if (!this.#scanner.scan()) {
                throw syntaxError("require comma or right round bracket. [dim]", this.#scanner);
            }
            const symToken = this.#scanner.token;
            if (symToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                break;
            }
            else if (symToken.tokenType === TokenType.COMMA) {
                if (dims.length === 3) {
                    throw boundaryError("number of dimensions must be less than 4. [dim]", symToken);
                }
            }
            else {
                throw syntaxError("require comma or right round bracket. [dim]", symToken);
            }
        }
        log.dump("dims", dims);
        if (!this.#scanner.scan()) {
            throw syntaxError("require keyword `as`. [dim]", this.#scanner);
        }
        const asToken = this.#scanner.token;
        if (asToken.value.toLowerCase() !== "as") {
            throw syntaxError("require keyword `as`. [dim]", asToken);
        }
        if (!this.#scanner.scan()) {
            throw syntaxError("require type keyword `integer` or `string`. [dim]", this.#scanner);
        }
        const typeToken = this.#scanner.token;
        log.dump("type", typeToken.value.toLowerCase());
        switch (typeToken.value.toLowerCase()) {
            case "integer":
                break;
            case "string":
                break;
            default:
                throw syntaxError("require type keyword `integer` or `string`. [dim]", typeToken);
        }
        if (this.#scanner.scan()) {
            const endToken = this.#scanner.token;
            if (endToken.tokenType !== TokenType.LINE_END) {
                throw syntaxError("unexpected token. [dim]", endToken);
            }
        }
        log.info("parsed dim.");
    }
}
export default Parser;
