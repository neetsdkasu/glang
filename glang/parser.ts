//
// Parser
//
import Logger, { LogLevel } from "logger";
const log = new Logger("parser", LogLevel.ALL);

import Scanner, { Token, TokenType } from "scanner";
import { Result } from "utils";

interface ToString {
    toString(): string;
}

function syntaxError<R>(msg: string, obj: ToString): Result<R,string> {
    return Result.err(`Syntax Error: ${msg} ( ${obj.toString()} )`);
}

function boundaryError<R>(msg: string, obj: ToString): Result<R,string> {
    return Result.err(`Boundary Error: ${msg} ( ${obj.toString()} )`);
}

const ReservedWordSet: Readonly<Set<string>> = Object.freeze(new Set([
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
    "string",
    "cbool",
    "cfloat",
    "cint",
    "cstr",
    "abs",
    "sign",
    "cos",
    "sin",
    "tan",
    "pow",
    "sqrt",
    "floor",
    "ceil"
]));

const POSITIVE_INTEGER_BOUND = BigInt(0x7FFFFFFF);
const NEGATIVE_INTEGER_BOUND = BigInt(2 ** 31);

log.dump("POSITIVE_INTEGER_BOUND", POSITIVE_INTEGER_BOUND);
log.dump("NEGATIVE_INTEGER_BOUND", NEGATIVE_INTEGER_BOUND);

function parseNumber(token: Token, negative?: boolean): Result<number,string> {
    switch (token.tokenType) {
        case TokenType.INTEGER:
        case TokenType.BIN_INETGER:
        case TokenType.HEX_INTEGER:
            const bi = BigInt(token.value);
            if (negative) {
                if (bi > NEGATIVE_INTEGER_BOUND) {
                    return boundaryError("unexpedted number.", token);
                }
            } else if (bi > POSITIVE_INTEGER_BOUND) {
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

export class Parser {
    readonly #scanner: Scanner;

    constructor(scanner: Scanner) {
        this.#scanner = scanner;
    }

    parse(): Result<any,string> {

        while (true) {
            const scanRes = this.#scanner.scan();
            if (scanRes.isErr) {
                return Result.err(scanRes.error);
            }
            if (!scanRes.result) {
                break;
            }

            const cmdToken = this.#scanner.token!;

            log.dump("cmdToken", cmdToken.toString());

            if (cmdToken.tokenType !== TokenType.WORD) {
                return syntaxError("illegal first token in line.", cmdToken);
            }

            let res: Result<any,string>;

            switch (cmdToken.value.toLowerCase()) {
                case "dim":
                    res = this.#parseDim();
                    break;
                default:
                    res = Result.err(`unimplemented error. ( ${cmdToken.toString()} )`);
                    break;
            }

            if (res.isErr) {
                return res;
            }
        }

        log.info("done");

        return Result.ok("ok");
    }

    #parseDim(): Result<any,string> {
        log.info("parse dim...");

        let scanRes = this.#scanner.scan();
        if (scanRes.isErr) {
            return Result.err(scanRes.error);
        }
        if (!scanRes.result) {
            return syntaxError("require an array name. [dim]", this.#scanner);
        }
        const arrName = this.#scanner.token!;

        log.dump("arrName", arrName.value);

        if (arrName.tokenType !== TokenType.WORD) {
            return syntaxError("require an array name. [dim]", arrName);
        }
        if (ReservedWordSet.has(arrName.value.toLowerCase())) {
            return syntaxError("wrong array name. [dim]", arrName);
        }

        scanRes = this.#scanner.scan();
        if (scanRes.isErr) {
            return Result.err(scanRes.error);
        }
        if (!scanRes.result) {
            return syntaxError("require left round bracket. [dim]", this.#scanner);
        }
        if (this.#scanner.token!.tokenType !== TokenType.LEFT_ROUND_BRACKET) {
            return syntaxError("require left round bracket. [dim]", this.#scanner);
        }

        let dims: number[] = [];
        let dm: number = 1;

        while (true) {
            scanRes = this.#scanner.scan();
            if (scanRes.isErr) {
                return Result.err(scanRes.error);
            }
            if (!scanRes.result) {
                break;
            }

            const sizeToken = this.#scanner.token!;
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
            if (!scanRes.result)
            {
                return syntaxError("require comma or right round bracket. [dim]", this.#scanner);
            }
            const symToken = this.#scanner.token!;
            if (symToken.tokenType === TokenType.RIGHT_ROUND_BRACKET) {
                break;
            } else if (symToken.tokenType === TokenType.COMMA) {
                if (dims.length === 3) {
                    return boundaryError("number of dimensions must be less than 4. [dim]", symToken);
                }
            } else {
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
        const asToken = this.#scanner.token!;
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
        const typeToken = this.#scanner.token!;

        log.dump("type", typeToken.value.toLowerCase());

        switch (typeToken.value.toLowerCase()) {
            case "boolean":
                break;
            case "float":
                break;
            case "integer":
                break;
            case "string":
                break;
            default:
                return syntaxError("require type keyword `integer` or `string` or `boolean` or `float`. [dim]", typeToken);
        }

        scanRes = this.#scanner.scan();
        if (scanRes.isErr) {
            return Result.err(scanRes.error);
        }
        if (scanRes.result) {
            const endToken = this.#scanner.token!;
            if (endToken.tokenType !== TokenType.LINE_END) {
                return syntaxError("unexpected token. [dim]", endToken);
            }
        }

        log.info("parsed dim.");

        return Result.ok("ok");
    }

}

export default Parser;
