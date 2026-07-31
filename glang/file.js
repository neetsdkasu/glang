//
// File
//
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("file", LogLevel.ALL);
import * as U from "./utils.js";
class MemFileMgr {
    constructor() { }
    async loadTitles() {
        throw new U.Unimplemented();
    }
}
class LSFileMgr {
    consutructor() {
    }
    get isErr() {
        // TODO
        return false;
    }
    get hasData() {
        // TODO
        return false;
    }
    async loadTitles() {
        throw new U.Unimplemented();
    }
}
const DB_NAME = "glang.db";
const DB_VERSION = 2;
const DB_TABLE_TITLE = "title";
const DB_TABLE_FILE = "file";
class DBFileMgr {
    #db;
    constructor(db) {
        this.#db = db;
    }
    async loadTitles() {
        return new Promise((resolve, reject) => {
            const titles = [];
            const request = this.#db
                .transaction(DB_TABLE_TITLE)
                .objectStore(DB_TABLE_TITLE)
                .openCursor();
            request.onerror = () => reject();
            request.onsuccess = ev => {
                const cursor = ev.target.result;
                if (cursor) {
                    const value = cursor.value;
                    titles.push(Object.assign({}, value));
                    cursor.continue();
                }
                else {
                    resolve(titles);
                }
            };
        });
    }
}
function buildDB(db, lsMgr) {
    db.createObjectStore(DB_TABLE_TITLE, { keyPath: "id", autoIncrement: true });
    db.createObjectStore(DB_TABLE_FILE, { keyPath: "id" });
    if (!lsMgr.hasData) {
        return;
    }
    // TODO: import dats from LS to DB
    throw new U.Unimplemented();
}
async function getFileMgr() {
    return new Promise(resolve => {
        const lsMgr = new LSFileMgr();
        if (indexedDB) {
            const openDBRequest = indexedDB.open(DB_NAME, DB_VERSION);
            openDBRequest.onerror = (e) => {
                if (lsMgr.isErr) {
                    log.info("use MEM");
                    resolve(new MemFileMgr());
                }
                else {
                    log.info("use LS");
                    resolve(lsMgr);
                }
            };
            openDBRequest.onupgradeneeded = (e) => {
                const db = e.target.result;
                buildDB(db, lsMgr);
            };
            openDBRequest.onsuccess = (e) => {
                log.info("use DB");
                const db = openDBRequest.result;
                resolve(new DBFileMgr(db));
            };
        }
        else {
            if (lsMgr.isErr) {
                log.info("use MEM");
                resolve(new MemFileMgr());
            }
            else {
                log.info("jse LS");
                resolve(lsMgr);
            }
        }
    });
}
const fileMgr = await getFileMgr();
export default fileMgr;
