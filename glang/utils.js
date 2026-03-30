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
    if (a !== b) {
        throw new Error(`assertEq error: msg="${msg}", (a=${a}) !== (b=${b})`);
    }
}
export function assertNe(a, b, msg) {
    if (a === b) {
        throw new Error(`assertNe error: msg="${msg}", (a=${a}) === (b=${b})`);
    }
}
export class Unimplemented extends Error {
    constructor(obj) {
        super(`未実装なのでエラー. ( ${obj} )`);
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
