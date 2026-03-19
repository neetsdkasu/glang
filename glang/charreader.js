//
// Reader
//
import RQueue from "rqueue";
class Item {
    value;
    pos;
    len;
    constructor(value, pos, len) {
        this.value = value;
        this.pos = pos;
        this.len = len;
    }
}
const BACKUP_SIZE = 5;
export class CharReader {
    #iterator;
    #last;
    #consumed = "";
    #pos = 0;
    #len = 0;
    #rq = new RQueue(BACKUP_SIZE);
    constructor(src) {
        this.#iterator = src[Symbol.iterator]();
        this.#last = this.#iterator.next();
    }
    hasNext() {
        return this.#rq.len > 0 || !(this.#last.done ?? false);
    }
    next() {
        if (this.#rq.len === 0) {
            this.#rq.enqueue(new Item(this.#last.value ?? "", this.#pos, this.#len));
            this.#last = this.#iterator.next();
        }
        const item = this.#rq.dequeue();
        this.#consumed = item.value;
        this.#pos = item.len;
        this.#len = item.len + this.#consumed.length;
        return this.#consumed;
    }
    back() {
        if (this.#rq.recover()) {
            const item = this.#rq.front;
            this.#pos = item.pos;
            this.#len = item.len;
            return true;
        }
        else {
            return false;
        }
    }
    pos() {
        return this.#pos;
    }
    len() {
        return this.#len;
    }
}
export default CharReader;
