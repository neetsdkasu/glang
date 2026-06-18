//
// Pseudo Random Number Generator ( Xorshift )
//
export class Xorshift32 {
    #value;
    constructor(seed) {
        this.#value = Math.max(Math.imul(Math.abs(seed), 1), 1);
    }
    gen() {
        let x = this.#value;
        x = x ^ (x << 13);
        x = x ^ (x >>> 17);
        x = x ^ (x << 5);
        this.#value = x;
        return x;
    }
}
export default Xorshift32;
