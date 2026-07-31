//
// File
//

import { CallStdFunc } from "./code.js";
import Logger, { LogLevel } from "./logger.js";
const log = new Logger("file", LogLevel.ALL);

import * as U from "./utils.js";

export type FileTitle = { id: number, title: string };

export type LoadTitlesCallback = (titles: FileTitle[]) => void;

export interface IFileMgr {
    loadTitles(): Promise<FileTitle[]>;
}

class MemFileMgr implements IFileMgr {
    constructor() {}

    async loadTitles(): Promise<FileTitle[]> {
        throw new U.Unimplemented();
    }
}

class LSFileMgr implements IFileMgr {
    consutructor() {
        
    }

    get isErr(): boolean {
        // TODO
        return false;
    }

    get hasData(): boolean {
        // TODO
        return false;
    }

    async loadTitles(): Promise<FileTitle[]> {
        throw new U.Unimplemented();
    }
}

const DB_NAME = "glang.db";
const DB_VERSION = 2;
const DB_TABLE_TITLE = "title";
const DB_TABLE_FILE = "file";

class DBFileMgr implements IFileMgr {
    #db: IDBDatabase;

    constructor(db: IDBDatabase) {
        this.#db = db;
    }

    async loadTitles(): Promise<FileTitle[]> {
        return new Promise( (resolve, reject) => {
            const titles: FileTitle[] = [];
            const request = this.#db
                .transaction(DB_TABLE_TITLE)
                .objectStore(DB_TABLE_TITLE)
                .openCursor();
            request.onerror = () => reject();
            request.onsuccess = ev => {
                const cursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const value = cursor.value as FileTitle;
                    titles.push(Object.assign({}, value));
                    cursor.continue();
                } else {
                    resolve(titles);
                }
            };
        });
    }
}

function buildDB(db: IDBDatabase, lsMgr: LSFileMgr): void {
    db.createObjectStore(DB_TABLE_TITLE, { keyPath: "id", autoIncrement: true });
    db.createObjectStore(DB_TABLE_FILE, { keyPath: "id" });
    if (!lsMgr.hasData) {
        return;
    }
    // TODO: import dats from LS to DB
    throw new U.Unimplemented();
}

async function getFileMgr(): Promise<IFileMgr> {
    return new Promise( resolve => {
        const lsMgr = new LSFileMgr();
        if (indexedDB) {
            const openDBRequest = indexedDB.open(DB_NAME, DB_VERSION);
            openDBRequest.onerror = (e) => {
                if (lsMgr.isErr) {
                    log.info("use MEM");
                    resolve(new MemFileMgr());
                } else {
                    log.info("use LS");
                    resolve(lsMgr);
                }
            };
            openDBRequest.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                buildDB(db, lsMgr);
            };
            openDBRequest.onsuccess = (e) => {
                log.info("use DB");
                const db = openDBRequest.result;
                resolve(new DBFileMgr(db));
            };
        } else {
            if (lsMgr.isErr) {
                log.info("use MEM");
                resolve(new MemFileMgr());
            } else {
                log.info("jse LS");
                resolve(lsMgr);
            }
        }
    });
}

const fileMgr: IFileMgr = await getFileMgr();

export default fileMgr;