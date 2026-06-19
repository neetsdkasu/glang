//
// Pseudo Random Number Generator ( Xorshift )
//

const DEFAULT_SEED32 = 0xC0FFEE;

export class Xorshift32 {
    #value: number;

    constructor(seed: number) {
        this.#value = Math.imul(seed, 1);
        if (this.#value === 0) {
            this.#value = DEFAULT_SEED32;
        }
    }

    setSeed(seed: number): void {
        this.#value = Math.imul(seed, 1);
        if (this.#value === 0) {
            this.#value = DEFAULT_SEED32;
        }
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
