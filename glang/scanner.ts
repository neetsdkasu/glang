//
// Scanner
//

import CharReader from "charreader";
import { Result } from "utils";

export enum TokenType {
    LINE_END,
    LEFT_ROUND_BRACKET,
    RIGHT_ROUND_BRACKET,
    LEFT_SQUARE_BRACKET,
    RIGHT_SQUARE_BRACKET,
    LEFT_CURLY_BRACKET,
    RIGHT_CURLY_BRACKET,
    COMMA,
    BACKQUOTE,
    OPERATOR,
    INTEGER,
    FLOATING_POINT,
    HEX_INTEGER,
    BIN_INETGER,
    STRING,
    WORD,
    COLON,
    SEMICOLON
}

export class Token {
    #tokenType: TokenType;
    #value: string;
    #col: number;
    #row: number;
    
    constructor(tokenType: TokenType, value: string, col: number, row: number) {
        this.#tokenType = tokenType;
        this.#value = value;
        this.#col = col;
        this.#row = row;
    }

    get tokenType(): TokenType {
        return this.#tokenType;
    }

    get value(): string {
        return this.#value;
    }

    get col(): number {
        return this.#col;
    }

    get row(): number {
        return this.#row;
    }

    toString(): string {
        return `Token{ tokenType: ${TokenType[this.#tokenType]}, value: "${this.#value}", pos: ${this.#col}, row: ${this.#row} }`;
    }
}

const WhiteSpaceRegExp = /^\s+$/;

const LINE_END_CHAR = "\n";
const LEFT_ROUND_BRACKET_CHAR = "(";
const RIGHT_ROUND_BRACKET_CHAR = ")";
const LEFT_SQUARE_BRACKET_CHAR = "[";
const RIGHT_SQUARE_BRACKET_CHAR = "]";
const LEFT_CURLY_BRACKET_CHAR = "{";
const RIGHT_CURLY_BRACKET_CHAR = "}";
const COMMA_CHAR = ",";
const BACKQUOTE_CHAR = "`";
const COMMENT_CHAR = "'";
const STRING_CHAR = '"';
const COLON_CHAR = ":";
const SEMICOLON_CHAR = ";";
const OPERATOR_CHARS = "+-*/%=<>.~^@?!|&\\";
const DIGIT_CHARS = "0123456789";
const HEX_DIGIT_CHARS = DIGIT_CHARS + "ABCDEF" + "abcdef";

const CharToTokenTypeMap: Readonly<Map<string, TokenType>> = Object.freeze(new Map([
    [LINE_END_CHAR, TokenType.LINE_END],
    [LEFT_ROUND_BRACKET_CHAR, TokenType.LEFT_ROUND_BRACKET],
    [RIGHT_ROUND_BRACKET_CHAR, TokenType.RIGHT_ROUND_BRACKET],
    [LEFT_SQUARE_BRACKET_CHAR, TokenType.LEFT_SQUARE_BRACKET],
    [RIGHT_SQUARE_BRACKET_CHAR, TokenType.RIGHT_SQUARE_BRACKET],
    [LEFT_CURLY_BRACKET_CHAR, TokenType.LEFT_CURLY_BRACKET],
    [RIGHT_CURLY_BRACKET_CHAR, TokenType.RIGHT_CURLY_BRACKET],
    [COMMA_CHAR, TokenType.COMMA],
    [COLON_CHAR, TokenType.COLON],
    [SEMICOLON_CHAR, TokenType.SEMICOLON],
    [BACKQUOTE_CHAR, TokenType.BACKQUOTE]
]));

function isWordChar(ch: string): boolean {
    if (ch === COMMENT_CHAR || ch === STRING_CHAR) {
        return false;
    }
    if (CharToTokenTypeMap.has(ch)) {
        return false;
    }
    if (ch.match(WhiteSpaceRegExp)) {
        return false;
    }
    if (OPERATOR_CHARS.includes(ch)) {
        return false;
    }
    return true;
}

const ErrString = "Syntax Error: String Token";
const ErrBinInteger = "Syntax Error: Binary Integer Token";
const ErrHexInteger = "Syntax Error: Hex Integer Token";
const ErrWord = "Syntax Error: Word Token";

export class Scanner {
    #reader: CharReader;
    #col: number = 0;
    #row: number = 0;
    #linestart: number = 0;
    #token: Token | undefined = undefined;

    constructor(reader: CharReader) {
        this.#reader = reader;
    }

    #skipWhitespaces(): void {
        while (this.#reader.hasNext()) {
            const ch = this.#reader.next();
            if (ch.match(WhiteSpaceRegExp) && ch !== LINE_END_CHAR) {
                continue;
            }
            this.#reader.back();
            return;
        }
    }

    #skipComment(): void {
        if (!this.#reader.hasNext()) {
            return;
        }
        if (this.#reader.next() !== COMMENT_CHAR) {
            this.#reader.back();
            return;
        }
        while (this.#reader.hasNext()) {
            if (this.#reader.next() === LINE_END_CHAR) {
                this.#reader.back();
                return;
            }
        }
    }

    scan(): Result<boolean,string> {

        if (this.#token?.tokenType === TokenType.LINE_END) {
            this.#row++;
            this.#linestart = this.#reader.len();
        }
        this.#token = undefined;

        this.#skipWhitespaces();
        this.#skipComment();

        if (!this.#reader.hasNext()) {
            this.#col = this.#reader.pos() - this.#linestart;
            return Result.ok(false);
        }

        let ch = this.#reader.next();
        let tokenType = TokenType.LINE_END;

        if (CharToTokenTypeMap.has(ch)) {
            tokenType = CharToTokenTypeMap.get(ch)!;
        } else if (ch === STRING_CHAR) {
            tokenType = TokenType.STRING;
            const strRes = this.#readString();
            if (strRes.isErr) {
                return Result.err(strRes.error);
            }
            ch = strRes.result;
        } else if (OPERATOR_CHARS.includes(ch)) {
            tokenType = TokenType.OPERATOR;
            this.#reader.back();
            ch = this.#readOperator();
        } else if (DIGIT_CHARS.includes(ch)) {
            const numRes = this.#readNumber(ch);
            if (numRes.isErr) {
                return Result.err(numRes.error);
            }
            const num = numRes.result;
            tokenType = num.tokenType;
            ch = num.token;
        } else {
            tokenType = TokenType.WORD;
            const wordRes = this.#readWord(ch);
            if (wordRes.isErr) {
                return Result.err(wordRes.error);
            }
            ch = wordRes.result;
        }

        this.#col = this.#reader.pos() - this.#linestart;

        this.#token = new Token(tokenType, ch, this.#col, this.#row);

        return Result.ok(true);
    }

    #readString(): Result<string,string> {
        let s = "";
        let end = false;
        while (this.#reader.hasNext()) {
            const ch = this.#reader.next();
            if (end) {
                if (ch !== STRING_CHAR) {
                    this.#reader.back();
                    return Result.ok(s);
                }
                end = false;
                s += ch;
            } else if (ch === STRING_CHAR) {
                end = true;
            } else  {
                s += ch;
            }
        }
        return Result.err(`${ErrString} ( ${this.toString()} )`);
    }

    #readOperator(): string {
        let s = "";
        while (this.#reader.hasNext()) {
            const ch = this.#reader.next();
            if (OPERATOR_CHARS.includes(ch)) {
                s += ch;
            } else {
                this.#reader.back();
                return s;
            }
        }
        return s;
    }

    #readNumber(head: string): Result<{ tokenType: TokenType, token: string }, string> {
        if (head === "0") {
            if (!this.#reader.hasNext()) {
                return Result.ok({
                    tokenType: TokenType.INTEGER,
                    token: "0"
                });
            }
            const sym = this.#reader.next();
            switch (sym) {
                case "b":
                case "B":
                    const binRes = this.#readBinInteger();
                    if (binRes.isErr) {
                        return Result.err(binRes.error);
                    }
                    return Result.ok({
                        tokenType: TokenType.BIN_INETGER,
                        token: "0" + sym + binRes.result
                    });
                case "x":
                case "X":
                    const hexRes = this.#readHexInteger();
                    if (hexRes.isErr) {
                        return Result.err(hexRes.error);
                    }
                    return Result.ok({
                        tokenType: TokenType.HEX_INTEGER,
                        token: "0" + sym + hexRes.result
                    });
                default:
                    // allow leading zeros
                    // unread sym char
                    this.#reader.back();
                    break;
            }
        }
        let intpart = head;
        while (this.#reader.hasNext()) {
            const ch = this.#reader.next();
            if (!DIGIT_CHARS.includes(ch)) {
                if (ch === ".") {
                    return Result.ok(this.#readNumberAfterDot(intpart));
                } else {
                    this.#reader.back();
                    break;
                }
            }
            intpart += ch;
        }
        return Result.ok({
            tokenType: TokenType.INTEGER,
            token: intpart,
        });
    }

    /**
     * the reader has already consume dot char "." when this method is called.
     * if the dot char does not mean a floating point, this method set to unread the dot.
     * @param intpart: must not include the dot.
     */
    #readNumberAfterDot(intpart: string): { tokenType: TokenType, token: string} {
        if (this.#reader.hasNext()) {
            const head = this.#reader.next();
            if (DIGIT_CHARS.includes(head)) {
                let fp = intpart + "." + head;
                while (this.#reader.hasNext()) {
                    const ch = this.#reader.next();
                    if (!DIGIT_CHARS.includes(ch)) {
                        this.#reader.back();
                        break;
                    }
                    fp += ch;
                }
                return {
                    tokenType: TokenType.FLOATING_POINT,
                    token: fp
                };
            } else {
                // unread head char
                this.#reader.back();
            }
        }
        // the dot does not mean a floating point
        // unread the dot char
        this.#reader.back();
        return {
            tokenType: TokenType.INTEGER,
            token: intpart
        };
    }

    #readBinInteger(): Result<string,string> {
        let bin = "";
        while (this.#reader.hasNext()) {
            const ch = this.#reader.next();
            if (ch !== "0" && ch !== "1") {
                this.#reader.back();
                break;
            }
            bin += ch;
        }
        if (bin.length === 0) {
            return Result.err(`${ErrBinInteger} ( ${this.toString()} )`);
        }
        return Result.ok(bin);
    }

    #readHexInteger(): Result<string,string> {
        let hex = "";
        while (this.#reader.hasNext()) {
            const ch = this.#reader.next();
            if (!HEX_DIGIT_CHARS.includes(ch)) {
                this.#reader.back();
                break;
            }
            hex += ch;
        }
        if (hex.length === 0) {
            return Result.err(`${ErrHexInteger} ( ${this.toString()} )`);
        }
        return Result.ok(hex);
    }

    /**
     * 
     */
    #readWord(head: string): Result<string,string> {
        if (!isWordChar(head) || DIGIT_CHARS.includes(head)) {
            return Result.err(`${ErrWord} ( ${this.toString()} )`);
        }
        let word = head;
        while (this.#reader.hasNext()) {
            const ch = this.#reader.next();
            if (!isWordChar(ch)) {
                this.#reader.back();
                break;
            }
            word += ch;
        }
        return Result.ok(word);
    }

    get token(): Token | undefined {
        return this.#token;
    }

    get col(): number {
        return this.#col;
    }

    get row(): number {
        return this.#row;
    }

    toString(): string {
        return `Scanner{ col: ${this.#col}, row: ${this.#row}, lastToken: ${this.#token?.value} }`;
    }
}


export default Scanner;
