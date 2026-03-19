//
// Reader
//

import RQueue from "rqueue";

class Item {
    value: string;
    pos: number;
    len: number;

    constructor(value: string, pos: number, len: number) {
        this.value = value;
        this.pos = pos;
        this.len = len;
    }
}

const BACKUP_SIZE = 5;

export class CharReader {
    #iterator: Iterator<string>;
    #last: IteratorResult<string, undefined>;
    #consumed: string = ""; 
    #pos: number = 0;
    #len: number = 0;
    #rq: RQueue<Readonly<Item>> = new RQueue(BACKUP_SIZE);

    constructor(src: string) {
        this.#iterator = src[Symbol.iterator]();
        this.#last = this.#iterator.next();
    }

    hasNext(): boolean {
        return this.#rq.len > 0 || !(this.#last.done ?? false);
    }

    next(): string {
        if (this.#rq.len === 0) {
            this.#rq.enqueue(new Item(this.#last.value ?? "", this.#pos, this.#len));
            this.#last = this.#iterator.next();
        }
        const item = this.#rq.dequeue()!;
        this.#consumed = item.value;
        this.#pos = item.len;
        this.#len = item.len + this.#consumed.length;
        return this.#consumed;
    }

    back(): boolean {
        if (this.#rq.recover()) {
            const item = this.#rq.front!;
            this.#pos = item.pos;
            this.#len = item.len;
            return true;
        } else {
            return false;
        }
    }

    pos(): number {
        return this.#pos;
    }

    len(): number {
        return this.#len;
    }
}


export default CharReader;
