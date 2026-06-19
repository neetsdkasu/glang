//
// Pseudo Random Number Generator ( Xorshift )
//

export class Xorshift32 {
    #value: number;

    constructor(seed: number) {
        this.#value = Math.max(Math.abs(Math.imul(seed, 1)), 1);
    }

    setSeed(seed: number): void {
        this.#value = Math.max(Math.abs(Math.imul(seed, 1)), 1);
    }

    gen(): number {
        let x = this.#value;
        x = x ^ (x << 13);
        x = x ^ (x >>> 17);
        x = x ^ (x << 5);
        this.#value = x;
        return x;
    }
}

export default Xorshift32;
