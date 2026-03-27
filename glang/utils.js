//
// utils
//
export function callToString(v) {
    if (v) {
        if (typeof v["toString"] === "function") {
            return v.toString();
        }
    }
    return v;
}
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
        throw new Error(`assertEq error: msg="${msg}", (a=${callToString(a)}) !== (b=${callToString(b)})`);
    }
}
export function assertNe(a, b, msg) {
    if (a === b) {
        throw new Error(`assertNe error: msg="${msg}", (a=${callToString(a)}) === (b=${callToString(b)})`);
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
            return `Result.Ok{ result: ${callToString(this.#result)} }`;
        }
        else {
            return `Result.Err{ error: ${callToString(this.#error)} }`;
        }
    }
}
export default {};
