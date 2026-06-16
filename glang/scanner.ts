//
// Scanner
//

import CharReader from "./charreader.js";
import { Result } from "./utils.js";

export type ScannerError = string;

export enum TokenType {
    EOF,
    EOL,
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

export interface IToken {
    readonly tokenType: TokenType;
    readonly value: string;   // 文字.
    readonly col: number;     // 文字の文書内の列位置.
    readonly row: number;     // 文字の文書内の行位置.
    readonly start: number;   // 文字の文書先頭からの文字の開始位置.
    readonly end: number;     // 文字の文書先頭からの文字の終端位置.
}

export class Token implements IToken {
    readonly tokenType: TokenType;
    readonly value: string;   // 文字.
    readonly col: number;     // 文字の文書内の列位置.
    readonly row: number;     // 文字の文書内の行位置.
    readonly start: number;   // 文字の文書先頭からの文字の開始位置.
    readonly end: number;     // 文字の文書先頭からの文字の終端位置.
    
    constructor(tokenType: TokenType, value: string, col: number, row: number, start: number, end: number) {
        this.tokenType = tokenType;
        this.value = value;
        this.col = col;
        this.row = row;
        this.start = start;
        this.end = end;
    }

    toString(): string {
        return `Token{ tokenType: ${TokenType[this.tokenType]}, value: "${this.value}", pos: ${this.col}, row: ${this.row}, start: ${this.start}, end: ${this.end} }`;
    }

    static lineToString(tokens: Readonly<IToken[]>): string {
        return tokens.map( (token) => {
            if (token.tokenType === TokenType.STRING) {
                return `"${token.value.replaceAll('"', '""')}"`;
            } else {
                return token.value.toLowerCase();
            }
        }).join(" ");
    }
}

const WhiteSpaceRegExp = /^\s+$/;

const EOL_CHAR = "\n";
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
const OPERATOR_CHARS = "+-*/%=<>.~^@#$?!|&\\";
const DIGIT_CHARS = "0123456789";
const HEX_DIGIT_CHARS = DIGIT_CHARS + "ABCDEF" + "abcdef";

const CharToTokenTypeMap: Readonly<Map<string, TokenType>> = Object.freeze(new Map([
    [EOL_CHAR, TokenType.EOL],
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
    readonly #reader: CharReader;
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
            if (ch.match(WhiteSpaceRegExp) && ch !== EOL_CHAR) {
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
            if (this.#reader.next() === EOL_CHAR) {
                this.#reader.back();
                return;
            }
        }
    }

    scan(): Result<boolean,ScannerError> {

        if (this.#token?.tokenType === TokenType.EOL) {
            this.#row++;
            this.#linestart = this.#reader.len;
        }
        this.#token = undefined;

        this.#skipWhitespaces();
        this.#skipComment();

        const start = this.#reader.len;

        if (!this.#reader.hasNext()) {
            const end = this.#reader.len;
            this.#col = this.#reader.pos - this.#linestart;
            this.#token = new Token(TokenType.EOF, "", this.#col, this.#row, start, end);
            return Result.ok(false);
        }

        let ch = this.#reader.next();
        let tokenType = TokenType.EOL;

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

        const end = this.#reader.len;

        this.#col = this.#reader.pos - this.#linestart;

        this.#token = new Token(tokenType, ch, this.#col, this.#row, start, end);

        return Result.ok(true);
    }

    #readString(): Result<string,ScannerError> {
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
                    // 先行ゼロを許容します
                    // 読み込んだ文字は後の処理に任せるため一度未読に戻します
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
     * 小数点かもしれないドット記号"."を#readerが読み取った後の状態で呼び出されることを想定しています
     * このメソッド内で小数点ではないと判定された場合はそのドット記号を未読状態になるようにこのメソッドから#reader.back()を呼び出します
     * @param intpart: ドット記号"."直前までの整数部分の文字列
     * @returns
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
                // ドット記号に続く文字が数字ではないので未読に戻します
                this.#reader.back();
            }
        }

        // ドット記号"."が小数点ではなかったため未読状態に戻します
        this.#reader.back();

        return {
            tokenType: TokenType.INTEGER,
            token: intpart
        };
    }

    #readBinInteger(): Result<string,ScannerError> {
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
            return Result.err(`${ErrBinInteger} ( ${this} )`);
        }
        return Result.ok(bin);
    }

    #readHexInteger(): Result<string,ScannerError> {
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
            return Result.err(`${ErrHexInteger} ( ${this} )`);
        }
        return Result.ok(hex);
    }

    /**
     * @param head 
     * @returns
     */
    #readWord(head: string): Result<string,ScannerError> {
        if (!isWordChar(head) || DIGIT_CHARS.includes(head)) {
            return Result.err(`${ErrWord} ( ${this} )`);
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
