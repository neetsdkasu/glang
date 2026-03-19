//
// RQueue
//
class Item {
    value = undefined;
    version = -100;
    set(value, version) {
        this.value = value;
        this.version = version;
    }
}
export class RQueue {
    #items;
    #front = 0;
    #end = 0;
    #len = 0;
    #version = 0;
    constructor(capacity) {
        this.#items = new Array(capacity).fill(new Item()).map(() => new Item());
    }
    enqueue(item) {
        this.#version++;
        if (this.#len === this.#items.length) {
            const dropped = this.#items[this.#end].value;
            this.#items[this.#end].set(item, this.#version);
            this.#end = (this.#end + 1) % this.#items.length;
            this.#front = this.#end;
            return dropped;
        }
        else {
            this.#items[this.#end].set(item, this.#version);
            this.#end = (this.#end + 1) % this.#items.length;
            this.#len++;
            return undefined;
        }
    }
    dequeue() {
        if (this.#len === 0) {
            return undefined;
        }
        const item = this.#items[this.#front].value;
        this.#front = (this.#front + 1) % this.#items.length;
        this.#len--;
        return item;
    }
    recover() {
        const prevIndex = (this.#front + this.#items.length - 1) % this.#items.length;
        const prevVersion = this.#items[prevIndex].version;
        if (this.#len === 0) {
            if (prevVersion !== this.#version) {
                return false;
            }
        }
        else if (prevVersion + 1 !== this.#items[this.#front].version) {
            return false;
        }
        this.#front = prevIndex;
        this.#len++;
        return true;
    }
    get len() {
        return this.#len;
    }
    get front() {
        if (this.#len === 0) {
            return undefined;
        }
        else {
            return this.#items[this.#front].value;
        }
    }
}
export default RQueue;
