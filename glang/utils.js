//
// utils
//
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("utils", LogLevel.ALL);
export function inRange(min, max, value) {
    return min <= value && value <= max;
}
export function parseIntWithDefault(strValue, defValue) {
    const intValue = parseInt(strValue);
    return isNaN(intValue) ? defValue : intValue;
}
export function assert(test, hint) {
    if (!test) {
        throw new Error(`assert error: hint="${hint}"`);
    }
}
export class Unimplemented extends Error {
    constructor(hint) {
        super(`未実装なのでエラー. ( ${hint} )`);
    }
}
export function unreachable(hint) {
    if (hint !== undefined) {
        throw new Error(`Unreachable: ${hint}`);
    }
    else {
        throw new Error("Unreachable");
    }
}
export function isInfinityOrNaN(x) {
    return isNaN(x) || x === Infinity || x === -Infinity;
}
export function isInteger(x) {
    return Math.trunc(x) === x;
}
export function popCount(n) {
    n = (n & 0x55555555) + ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    n = (n & 0x0F0F0F0F) + ((n >>> 4) & 0x0F0F0F0F);
    n = (n & 0x00FF00FF) + ((n >>> 8) & 0x00FF00FF);
    return (n & 0x0000FFFF) + ((n >>> 16) & 0x0000FFFF);
}
/**
 * 二分探索.
 * find index -> 0 <= index && (index === 0 || test(arr[index-1]) === true) && (arr.length <= index || test(arr[index]) === false).
 * @param arr
 * @param test
 */
export function binarySearch(arr, test) {
    let lower = 0;
    let upper = arr.length;
    while (lower + 1 < upper) {
        const half = (lower + upper) >> 1;
        if (test(arr[half])) {
            lower = half;
        }
        else {
            upper = half;
        }
    }
    return (lower < arr.length && test(arr[lower])) ? upper : lower;
}
if (false)
    (function test_binarySearch() {
        log.debug("test binarySearch...");
        function tcheck(x, t, v) {
            if (typeof x !== t) {
                throw new Error(`x is not ${t}: actual type is "${typeof x}" (value: ${x})`);
            }
            return v;
        }
        {
            const arr1 = [0, 1, 2, 3, 4, 5, 6];
            for (let i = -1; i <= 8; i++) {
                const expect = Math.min(arr1.length, Math.max(0, i));
                const actual = binarySearch(arr1, x => tcheck(x, "number", x < i));
                assert(actual === expect, `arr1: i=${i}, expect=${expect}, actual=${actual}`);
            }
        }
        {
            const arr2 = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];
            for (let i = -1; i <= 8; i++) {
                const expect = Math.min(arr2.length, Math.max(0, i * 2));
                const actual = binarySearch(arr2, x => tcheck(x, "number", x < i));
                assert(actual === expect, `arr2: i=${i}, expect=${expect}, actual=${actual}`);
            }
        }
        {
            const arr3 = [0];
            for (let i = -1; i <= 8; i++) {
                const expect = Math.min(arr3.length, Math.max(0, i));
                const actual = binarySearch(arr3, x => tcheck(x, "number", x < i));
                assert(actual === expect, `arr3: i=${i}, expect=${expect}, actual=${actual}`);
            }
        }
        {
            const arr4 = [];
            for (let i = -1; i <= 8; i++) {
                const expect = Math.min(arr4.length, Math.max(0, i));
                const actual = binarySearch(arr4, x => tcheck(x, "number", x < i));
                assert(actual === expect, `arr4: i=${i}, expect=${expect}, actual=${actual}`);
            }
        }
        {
            const arr5 = ["b", "c", "d", "e"];
            const target = ["a", "b", "c", "d", "e", "f"];
            for (let i = 0; i < target.length; i++) {
                const ch = target[i];
                const expect = Math.min(arr5.length, Math.max(0, i - 1));
                const actual = binarySearch(arr5, x => tcheck(x, "string", x < ch));
                assert(actual === expect, `arr5: i=${i}, expect=${expect}, actual=${actual}`);
            }
        }
        log.debug("test ok.");
    })();
export class Range {
    min;
    max;
    constructor(min, max) {
        this.min = min;
        this.max = max;
    }
    /**
     * 値がRangeの内側かを判定.
     * @param value
     * @returns
     */
    include(value) {
        return inRange(this.min, this.max, value);
    }
    /**
     * 値がRangeの外側かを判定.
     * @param value
     * @returns
     */
    exclude(value) {
        return !this.include(value);
    }
    cmp(other) {
        if (this.min < other.min) {
            return -1;
        }
        else if (this.min > other.min) {
            return 1;
        }
        else {
            return Math.sign(this.max - other.max);
        }
    }
    toString() {
        return `Range{ min: ${this.min}, max: ${this.max} }`;
    }
}
/**
 * 一度だけ値を書き込めてその値を保持する.
 * constの初期化を条件分岐で変えたくて後回しにしたいときに使う.要するにうっかりミスの再代入を回避したい.
 * 値がオブジェクトの場合はそのままではオブジェクトの中身の変更を制限しないためReadonlyを使いOnce< Readonly< T > >にすれば中身をtypescriptの範囲で保護できる(ホンマか？).
 */
export class Once {
    #written = false;
    #value;
    constructor() { }
    set(value) {
        if (this.#written) {
            throw new Error("Utils.Once: already written");
        }
        this.#written = true;
        this.#value = value;
    }
    get() {
        if (!this.#written) {
            throw new Error("Utils.Once: no value");
        }
        return this.#value;
    }
}
/**
 * 現状、let v: T | undefined = foo; で事足りてるよね.
 * let v: utils.Option<T> = utils.Option.some(foo); したい状況は発生してない.
 * typescriptの if (v !== undefined) { ... } での静的検査のほうが信頼性高い.
 * メモリコストからしてもこのOption<T>使う理由が薄い.コスト高すぎる.
 * .getOr()相当は ??演算子がjavascript、.map()/.then()に近い処理は .?演算子 、 .value() 相当は !演算子 がtypescriptで用意されているし、このOption<T>は冗長すぎる.
 * 強いて用途を考えるならTにundefinedを含めることができる？、Option.some(undefined)とOption.none()は異なる.
 * どうでもいいけど、javascriptかtypescriptでOptionという名前が定義済みぽそう？ type Option = any; で定義されているぽい？.
 * 名前はOption/Some/NoneではなくHaskellぽくMaybe/Just/Nothingにでもすればよかったか？.
 */
export class Option {
    #hasValue;
    #value;
    constructor(hasValue, value) {
        this.#hasValue = hasValue;
        if (hasValue) {
            this.#value = value;
        }
        else {
            this.#value = undefined;
        }
    }
    get valueOrUndefined() {
        return this.#value;
    }
    get value() {
        if (!this.#hasValue) {
            throw new Error("no value");
        }
        return this.#value;
    }
    get isSome() {
        return this.#hasValue;
    }
    get isNone() {
        return !this.#hasValue;
    }
    static some(value) {
        return new Option(true, value);
    }
    static none() {
        return new Option(false);
    }
    static wrap(value) {
        if (value === undefined) {
            return Option.none();
        }
        else {
            // valueの型が V & ({} | null) になるけど何故…？
            return Option.some(value);
        }
    }
    getOr(defValue) {
        if (this.#hasValue) {
            return this.#value;
        }
        else {
            return defValue;
        }
    }
    andThen(f) {
        if (this.#hasValue) {
            return f(this.value);
        }
        else {
            return Option.none();
        }
    }
    map(f) {
        if (this.#hasValue) {
            return Option.some(f(this.#value));
        }
        else {
            return Option.none();
        }
    }
    toString() {
        if (this.#hasValue) {
            return `Option.Some{ value: ${this.value} }`;
        }
        else {
            return "Option.None{}";
        }
    }
}
/**
 * 現状、let v: T | E = foo; してからの型ごとにチェック分岐コード書くのがだるい.静的な型検査が入るのはメリットなのだが.
 * let v: Result<T, E> = Result.ok(foo); の isOk,isErr での分岐では静的検査がないのが欠点.
 * 一方をエラー型の扱いにしてるため単純に２つの型のいずれかを返すという用途では使えない(必要ならHaskellのEitherみたいなの作ればよいがLeft/Rightでは文脈が意味不明すぎるのでそれならtypescriptの X | Y で型並べるほうが健全).
 * まぁ、メモリコストがバカ高いので多用するのはよくないかも.すでに多用しまくっているけれども.
 */
export class Result {
    #ok;
    #result;
    #error;
    constructor(ok, result, error) {
        this.#ok = ok;
        this.#result = result;
        this.#error = error;
    }
    get isOk() {
        return this.#ok;
    }
    get isErr() {
        return !this.#ok;
    }
    get result() {
        if (this.#ok) {
            return this.#result;
        }
        else {
            throw new Error("no result");
        }
    }
    get error() {
        if (this.#ok) {
            throw new Error("no error");
        }
        else {
            return this.#error;
        }
    }
    get valueOrError() {
        if (this.#ok) {
            return this.#result;
        }
        else {
            return this.#error;
        }
    }
    get valueOrUndefined() {
        return this.#result;
    }
    static ok(result) {
        return new Result(true, result, undefined);
    }
    static err(error) {
        return new Result(false, undefined, error);
    }
    getOr(defValue) {
        if (this.#ok) {
            return this.#result;
        }
        else {
            return defValue;
        }
    }
    andThen(f) {
        if (this.#ok) {
            return f(this.#result);
        }
        else {
            return Result.err(this.#error);
        }
    }
    map(f) {
        if (this.#ok) {
            return Result.ok(f(this.#result));
        }
        else {
            return Result.err(this.#error);
        }
    }
    toString() {
        if (this.#ok) {
            return `Result.Ok{ result: ${this.#result} }`;
        }
        else {
            return `Result.Err{ error: ${this.#error} }`;
        }
    }
}
export default {};
