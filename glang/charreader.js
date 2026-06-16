//
// Reader
//
import RQueue from "./rqueue.js";
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
export const BACKUP_SIZE = 5;
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
    /**
     * 文書内に未読文字が存在するか.
     * @returns 存在するならtrue.
     */
    hasNext() {
        return this.#rq.len > 0 || !(this.#last.done ?? false);
    }
    /**
     * 文書から1文字読む.
     * @returns 読み込んだ文字を返す.
     */
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
    /**
     * 最後に読んだ文字の1文字分を未読に戻す.
     * 連続でback()することで最大 BACKUP_SIZE 分までを未読に戻せる.
     * @returns 戻すことに成功したらtrue.失敗したらfalse.
     */
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
    /**
     * next()の文字の文書内の位置.
     */
    get pos() {
        return this.#pos;
    }
    /**
     * next()の文字を含めてこれまで読み込んだ文字の長さの合計.
     * len-pos でnext()の文字の長さになる.
     */
    get len() {
        return this.#len;
    }
}
export default CharReader;
