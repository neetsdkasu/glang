//
// RQueue
//

class Item<T> {
    #value: T | undefined = undefined;
    #version: number = -100;

    set(value: T, version: number): void {
        this.#value = value;
        this.#version = version;
    }

    get value(): T | undefined {
        return this.#value;
    }

    get version(): number {
        return this.#version;
    }
}

export class RQueue<T> {
    readonly #items: Item<T>[];
    #front: number = 0;
    #end: number = 0;
    #len: number = 0;
    #version: number = 0;
    
    constructor(capacity: number) {
        this.#items = new Array<Item<T>>(capacity).fill(new Item()).map(() => new Item());
    }

    enqueue(item: T): T | undefined {
        this.#version++;
        if (this.#len === this.#items.length) {
            const dropped = this.#items[this.#end].value;
            this.#items[this.#end].set(item, this.#version);
            this.#end = (this.#end + 1) % this.#items.length;
            this.#front = this.#end;
            return dropped;
        } else {
            this.#items[this.#end].set(item, this.#version);
            this.#end = (this.#end + 1) % this.#items.length;
            this.#len++;
            return undefined;
        }
    }

    dequeue(): T | undefined {
        if (this.#len === 0) {
            return undefined;
        }
        const item = this.#items[this.#front].value;
        this.#front = (this.#front + 1) % this.#items.length;
        this.#len--;
        return item;
    }

    dequeueN(n: number): { ok: boolean, items: T[] } {
        const items: T[] = [];
        for (let i = 0; i < n; i++) {
            const item = this.dequeue();
            if (item === undefined) {
                return { ok: false, items: items };
            }
            items.push(item);
        }
        return { ok: true, items: items };
    }

    recover(): boolean {
        const prevIndex = (this.#front + this.#items.length - 1) % this.#items.length;
        const prevVersion = this.#items[prevIndex].version;
        if (this.#len === 0) {
            if (prevVersion !== this.#version) {
                return false;
            }
        } else if (prevVersion + 1 !== this.#items[this.#front].version) {
            return false;
        }
        this.#front = prevIndex;
        this.#len++;
        return true;
    }

    recoverN(n: number): { ok: boolean, recoverd: number } {
        let c = 0;
        while (c < n) {
            if (!this.recover()) {
                return { ok: false, recoverd: c };
            }
            c++
        }
        return { ok: true, recoverd: c };  
    }

    get len(): number {
        return this.#len;
    }

    get front(): T | undefined {
        if (this.#len === 0) {
            return undefined;
        } else {
            return this.#items[this.#front].value;
        }
    }

    static wrap<T>(items: T[]): RQueue<T> {
        const rq = new RQueue<T>(items.length);
        for (const item of items) {
            rq.enqueue(item);
        }
        return rq;
    }
}

export default RQueue;
