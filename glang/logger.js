class Logger {
    #name;
    constructor(name) {
        this.#name = name;
    }
    dump(msg, obj) {
        console.log(`[${this.#name}]d: ${msg}: ${obj}`);
    }
    info(msg) {
        console.log(`[${this.#name}]i: ${msg}`);
    }
    error(msg) {
        console.log(`[${this.#name}]E: ${msg}`);
    }
}
export default Logger;
