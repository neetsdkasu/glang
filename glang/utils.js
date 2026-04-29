//
// utils
//
export function inRange(min, max, value) {
    return min <= value && value <= max;
}
export function assert(test, msg) {
    if (!test) {
        throw new Error(`assert error: msg="${msg}"`);
    }
}
export function assertEq(a, b, msg) {
    assert(a === b, `assertEq error: msg="${msg}", not (a=${a}) !== (b=${b})`);
}
export function assertNE(a, b, msg) {
    assert(a !== b, `assertNE error: msg="${msg}", (a=${a}) === (b=${b})`);
}
export function assertLT(a, b, msg) {
    assert(a < b, `assertLT error: msg="${msg}", (a=${a}) >= (b=${b})`);
}
export function assertLE(a, b, msg) {
    assert(a <= b, `assertLE error: msg="${msg}", (a=${a}) > (b=${b})`);
}
export function assertGT(a, b, msg) {
    assert(a > b, `assertGT error: msg="${msg}", (a=${a}) <= (b=${b})`);
}
export function assertGE(a, b, msg) {
    assert(a >= b, `assertGE error: msg="${msg}", (a=${a}) < (b=${b})`);
}
export class Unimplemented extends Error {
    constructor(obj) {
        super(`未実装なのでエラー. ( ${obj} )`);
    }
}
export function popCount(n) {
    n = (n & 0x55555555) + ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    n = (n & 0x0F0F0F0F) + ((n >>> 4) & 0x0F0F0F0F);
    n = (n & 0x00FF00FF) + ((n >>> 8) & 0x00FF00FF);
    return (n & 0x0000FFFF) + ((n >>> 16) & 0x0000FFFF);
}
/**
 * 一度だけ値を書き込めてその値を保持する.
 * constの初期化を条件分岐で変えたくて後回しにしたいときに使う.
 * 値がオブジェクトの場合はそのままではオブジェクトの中身の変更を制限しないためReadonlyを使いOnce< Readonly< T > >にすれば中身をtypescript的に保護できる.
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
    get value() {
        if (this.#hasValue) {
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
    then(f) {
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
    then(f) {
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
