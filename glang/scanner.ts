//
// Scanner
//

import CharReader from "charreader";
import RQueue from "rqueue";

export enum TokenType {
    LINE_END,
    LEFT_ROUND_BRACKET,
    RIGHT_ROUND_BRACKET,
    LEFT_SQUARE_BRACKET,
    RIGHT_SQUARE_BRACKET,
    LEFT_CURLY_BRACKET,
    RIGHT_CURLY_BRACKET,
    COMMA,
    OPERATOR,
    INTEGER,
    FLOATING_POINT,
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
        return `Token{ tokenType: ${TokenType[this.tokenType]}, value: "${this.value}", pos: ${this.col}, row: ${this.row} }`;
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
const COMMENT_CHAR = "'";
const STRING_CHAR = '"';
const COLON_CHAR = ":";
const SEMICOLON_CHAR = ";";
const OPERATOR_CHARS = "+-*/%=<>.~^@?!|&\\";
const DIGIT_CHARS = "0123456789";

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
    [SEMICOLON_CHAR, TokenType.SEMICOLON]
]));

const ErrString = "Syntax Error: String Token";

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

    scan(): boolean {

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
            tokenType = CharToTokenTypeMap.get(ch)!;
        } else if (ch === STRING_CHAR) {
            tokenType = TokenType.STRING;
            ch = this.#readString();
        } else if (OPERATOR_CHARS.includes(ch)) {
            tokenType = TokenType.OPERATOR;
            this.#reader.back();
            ch = this.#readOperator();
        } else if (DIGIT_CHARS.includes(ch)) {
            this.#reader.back();
            const num = this.#readNumber();
            tokenType = num.tokenType;
            ch = num.token;
        } else {
            tokenType = TokenType.WORD;
        }

        this.#col = this.#reader.pos() - this.#linestart;

        this.#token = new Token(tokenType, ch, this.#col, this.#row);

        return true;
    }

    #readString(): string {
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
            } else if (ch === STRING_CHAR) {
                end = true;
            } else  {
                s += ch;
            }
        }
        throw ErrString;
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

    #readNumber(): { tokenType: TokenType, token: string } {
        this.#reader.next();
        return {
            tokenType: TokenType.INTEGER,
            token: "",
        };
    }

    get token(): Token | undefined {
        return this.#token
    }

    get col(): number {
        return this.#col;
    }

    get row(): number {
        return this.#row;
    }
}


export default Scanner;
