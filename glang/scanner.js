//
// Scanner
//
import { Result } from "./utils.js";
export var TokenType;
(function (TokenType) {
    TokenType[TokenType["EOF"] = 0] = "EOF";
    TokenType[TokenType["EOL"] = 1] = "EOL";
    TokenType[TokenType["LEFT_ROUND_BRACKET"] = 2] = "LEFT_ROUND_BRACKET";
    TokenType[TokenType["RIGHT_ROUND_BRACKET"] = 3] = "RIGHT_ROUND_BRACKET";
    TokenType[TokenType["LEFT_SQUARE_BRACKET"] = 4] = "LEFT_SQUARE_BRACKET";
    TokenType[TokenType["RIGHT_SQUARE_BRACKET"] = 5] = "RIGHT_SQUARE_BRACKET";
    TokenType[TokenType["LEFT_CURLY_BRACKET"] = 6] = "LEFT_CURLY_BRACKET";
    TokenType[TokenType["RIGHT_CURLY_BRACKET"] = 7] = "RIGHT_CURLY_BRACKET";
    TokenType[TokenType["COMMA"] = 8] = "COMMA";
    TokenType[TokenType["BACKQUOTE"] = 9] = "BACKQUOTE";
    TokenType[TokenType["OPERATOR"] = 10] = "OPERATOR";
    TokenType[TokenType["INTEGER"] = 11] = "INTEGER";
    TokenType[TokenType["FLOATING_POINT"] = 12] = "FLOATING_POINT";
    TokenType[TokenType["HEX_INTEGER"] = 13] = "HEX_INTEGER";
    TokenType[TokenType["BIN_INETGER"] = 14] = "BIN_INETGER";
    TokenType[TokenType["STRING"] = 15] = "STRING";
    TokenType[TokenType["WORD"] = 16] = "WORD";
    TokenType[TokenType["COLON"] = 17] = "COLON";
    TokenType[TokenType["SEMICOLON"] = 18] = "SEMICOLON";
})(TokenType || (TokenType = {}));
export class Token {
    tokenType;
    value; // 文字.
    col; // 文字の文書内の列位置.
    row; // 文字の文書内の行位置.
    start; // 文字の文書先頭からの文字の開始位置.
    end; // 文字の文書先頭からの文字の終端位置.
    constructor(tokenType, value, col, row, start, end) {
        this.tokenType = tokenType;
        this.value = value;
        this.col = col;
        this.row = row;
        this.start = start;
        this.end = end;
    }
    toString() {
        return `Token{ tokenType: ${TokenType[this.tokenType]}, value: "${this.value}", pos: ${this.col}, row: ${this.row}, start: ${this.start}, end: ${this.end} }`;
    }
    static lineToString(tokens) {
        return tokens.map((token) => {
            if (token.tokenType === TokenType.STRING) {
                return `"${token.value.replaceAll('"', '""')}"`;
            }
            else {
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
const CharToTokenTypeMap = Object.freeze(new Map([
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
function isWordChar(ch) {
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
    #reader;
    #col = 0;
    #row = 0;
    #linestart = 0;
    #token = undefined;
    constructor(reader) {
        this.#reader = reader;
    }
    #skipWhitespaces() {
        while (this.#reader.hasNext()) {
            const ch = this.#reader.next();
            if (ch.match(WhiteSpaceRegExp) && ch !== EOL_CHAR) {
                continue;
            }
            this.#reader.back();
            return;
        }
    }
    #skipComment() {
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
    scan() {
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
            tokenType = CharToTokenTypeMap.get(ch);
        }
        else if (ch === STRING_CHAR) {
            tokenType = TokenType.STRING;
            const strRes = this.#readString();
            if (strRes.isErr) {
                return Result.err(strRes.error);
            }
            ch = strRes.result;
        }
        else if (OPERATOR_CHARS.includes(ch)) {
            tokenType = TokenType.OPERATOR;
            this.#reader.back();
            ch = this.#readOperator();
        }
        else if (DIGIT_CHARS.includes(ch)) {
            const numRes = this.#readNumber(ch);
            if (numRes.isErr) {
                return Result.err(numRes.error);
            }
            const num = numRes.result;
            tokenType = num.tokenType;
            ch = num.token;
        }
        else {
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
    #readString() {
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
            }
            else if (ch === STRING_CHAR) {
                end = true;
            }
            else {
                s += ch;
            }
        }
        return Result.err(`${ErrString} ( ${this.toString()} )`);
    }
    #readOperator() {
        let s = "";
        while (this.#reader.hasNext()) {
            const ch = this.#reader.next();
            if (OPERATOR_CHARS.includes(ch)) {
                s += ch;
            }
            else {
                this.#reader.back();
                return s;
            }
        }
        return s;
    }
    #readNumber(head) {
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
                }
                else {
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
    #readNumberAfterDot(intpart) {
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
            }
            else {
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
    #readBinInteger() {
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
    #readHexInteger() {
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
    #readWord(head) {
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
    get token() {
        return this.#token;
    }
    get col() {
        return this.#col;
    }
    get row() {
        return this.#row;
    }
    toString() {
        return `Scanner{ col: ${this.#col}, row: ${this.#row}, lastToken: ${this.#token?.value} }`;
    }
}
export default Scanner;
