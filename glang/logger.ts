
class Logger {
    #name: string;
    
    constructor(name: string) {
        this.#name = name;
    }

    dump(msg: string, obj: any): void {
        console.log(`[${this.#name}]d: ${msg}: ${obj}`);
    }

    info(msg: string): void {
        console.log(`[${this.#name}]i: ${msg}`);
    }

    error(msg: string): void {
        console.log(`[${this.#name}]E: ${msg}`);
    }
}

export default Logger;
