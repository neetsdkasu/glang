//
// Scanner
//
export var TokenType;
(function (TokenType) {
    TokenType[TokenType["LINE_END"] = 0] = "LINE_END";
    TokenType[TokenType["LEFT_ROUND_BRACKET"] = 1] = "LEFT_ROUND_BRACKET";
    TokenType[TokenType["RIGHT_ROUND_BRACKET"] = 2] = "RIGHT_ROUND_BRACKET";
    TokenType[TokenType["LEFT_SQUARE_BRACKET"] = 3] = "LEFT_SQUARE_BRACKET";
    TokenType[TokenType["RIGHT_SQUARE_BRACKET"] = 4] = "RIGHT_SQUARE_BRACKET";
    TokenType[TokenType["LEFT_CURLY_BRACKET"] = 5] = "LEFT_CURLY_BRACKET";
    TokenType[TokenType["RIGHT_CURLY_BRACKET"] = 6] = "RIGHT_CURLY_BRACKET";
    TokenType[TokenType["COMMA"] = 7] = "COMMA";
    TokenType[TokenType["BACKQUOTE"] = 8] = "BACKQUOTE";
    TokenType[TokenType["OPERATOR"] = 9] = "OPERATOR";
    TokenType[TokenType["INTEGER"] = 10] = "INTEGER";
    TokenType[TokenType["FLOATING_POINT"] = 11] = "FLOATING_POINT";
    TokenType[TokenType["HEX_INTEGER"] = 12] = "HEX_INTEGER";
    TokenType[TokenType["BIN_INETGER"] = 13] = "BIN_INETGER";
    TokenType[TokenType["STRING"] = 14] = "STRING";
    TokenType[TokenType["WORD"] = 15] = "WORD";
    TokenType[TokenType["COLON"] = 16] = "COLON";
    TokenType[TokenType["SEMICOLON"] = 17] = "SEMICOLON";
})(TokenType || (TokenType = {}));
export class Token {
    #tokenType;
    #value;
    #col;
    #row;
    constructor(tokenType, value, col, row) {
        this.#tokenType = tokenType;
        this.#value = value;
        this.#col = col;
        this.#row = row;
    }
    get tokenType() {
        return this.#tokenType;
    }
    get value() {
        return this.#value;
    }
    get col() {
        return this.#col;
    }
    get row() {
        return this.#row;
    }
    toString() {
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
const CharToTokenTypeMap = Object.freeze(new Map([
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
export const ErrString = "Syntax Error: String Token";
export const ErrBinInteger = "Syntax Error: Binary Integer Token";
export const ErrHexInteger = "Syntax Error: Hex Integer Token";
export const ErrWord = "Syntax Error: Word Token";
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
            if (ch.match(WhiteSpaceRegExp) && ch !== LINE_END_CHAR) {
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
            if (this.#reader.next() === LINE_END_CHAR) {
                this.#reader.back();
                return;
            }
        }
    }
    scan() {
        if (this.#token?.tokenType === TokenType.LINE_END) {
            this.#row++;
            this.#linestart = this.#reader.len();
        }
        this.#token = undefined;
        this.#skipWhitespaces();
        this.#skipComment();
        if (!this.#reader.hasNext()) {
            this.#col = this.#reader.pos() - this.#linestart;
            return false;
        }
        let ch = this.#reader.next();
        let tokenType = TokenType.LINE_END;
        if (CharToTokenTypeMap.has(ch)) {
            tokenType = CharToTokenTypeMap.get(ch);
        }
        else if (ch === STRING_CHAR) {
            tokenType = TokenType.STRING;
            ch = this.#readString();
        }
        else if (OPERATOR_CHARS.includes(ch)) {
            tokenType = TokenType.OPERATOR;
            this.#reader.back();
            ch = this.#readOperator();
        }
        else if (DIGIT_CHARS.includes(ch)) {
            const num = this.#readNumber(ch);
            tokenType = num.tokenType;
            ch = num.token;
        }
        else {
            tokenType = TokenType.WORD;
            ch = this.#readWord(ch);
        }
        this.#col = this.#reader.pos() - this.#linestart;
        this.#token = new Token(tokenType, ch, this.#col, this.#row);
        return true;
    }
    #readString() {
        let s = "";
        let end = false;
        while (this.#reader.hasNext()) {
            const ch = this.#reader.next();
            if (end) {
                if (ch !== STRING_CHAR) {
                    this.#reader.back();
                    return s;
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
        throw ErrString;
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
                return {
                    tokenType: TokenType.INTEGER,
                    token: "0"
                };
            }
            const sym = this.#reader.next();
            switch (sym) {
                case "b":
                case "B":
                    return {
                        tokenType: TokenType.BIN_INETGER,
                        token: "0" + sym + this.#readBinInteger()
                    };
                case "x":
                case "X":
                    return {
                        tokenType: TokenType.HEX_INTEGER,
                        token: "0" + sym + this.#readHexInteger()
                    };
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
                    return this.#readNumberAfterDot(intpart);
                }
                else {
                    this.#reader.back();
                    break;
                }
            }
            intpart += ch;
        }
        return {
            tokenType: TokenType.INTEGER,
            token: intpart,
        };
    }
    /**
     * the reader has already consume dot char "." when this method is called.
     * if the dot char does not mean a floating point, this method set to unread the dot.
     * @param intpart: must not include the dot.
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
            throw ErrBinInteger;
        }
        return bin;
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
            throw ErrHexInteger;
        }
        return hex;
    }
    /**
     *
     */
    #readWord(head) {
        if (!isWordChar(head) || DIGIT_CHARS.includes(head)) {
            throw ErrWord;
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
        return word;
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
