//
// utils
//

export function inRange(min: number, max: number, value: number): boolean {
    return min <= value && value <= max;
}

export function assert(test: boolean, msg?: string): void {
    if (!test) {
        throw new Error(`assert error: msg="${msg}"`);
    }
}

export function assertEq<T>(a: T, b: T, msg?: string): void {
    if (a !== b) {
        throw new Error(`assertEq error: msg="${msg}", (a=${a}) !== (b=${b})`);
    }
}

export function assertNe<T>(a: T, b: T, msg?: string): void {
    if (a === b) {
        throw new Error(`assertNe error: msg="${msg}", (a=${a}) === (b=${b})`);
    }
}

export class Result<R,E> {
    #ok: boolean;
    #result: R | undefined;
    #error: E | undefined;
    
    constructor(ok: boolean, result: R | undefined, error: E | undefined) {
        this.#ok = ok;
        this.#result = result;
        this.#error = error;
    }

    get isOk(): boolean {
        return this.#ok;
    }

    get isErr(): boolean {
        return !this.#ok;
    }

    get result(): R {
        if (this.#ok) {
            return this.#result!;
        } else {
            throw new Error("no result");
        }
    }

    get error(): E {
        if (this.#ok) {
            throw new Error("no error");
        } else {
            return this.#error!;
        }
    }

    static ok<R,E>(result: R): Result<R,E> {
        return new Result<R,E>(true, result, undefined);
    }

    static err<R,E>(error: E): Result<R,E> {
        return new Result<R,E>(false, undefined, error);
    }

    then<S>(f: (result: R) => Result<S,E>): Result<S,E> {
        if (this.#ok) {
            return f(this.#result!);
        } else {
            return Result.err<S,E>(this.#error!);
        }
    }

    map<S>(f: (result: R) => S): Result<S,E> {
        if (this.#ok) {
            return Result.ok(f(this.#result!));
        } else {
            return Result.err(this.#error!);
        }
    }

    toString(): string {
        if (this.#ok) {
            return `Result.Ok{ result: ${this.#result} }`;
        } else {
            return `Result.Err{ error: ${this.#error} }`;
        }
    }

}

export default {};
