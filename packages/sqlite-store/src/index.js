import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const SQLITE_BUSY_CODES = new Set([5, 261]);
const OPEN_RETRY_COUNT = 20;
const OPERATION_RETRY_COUNT = 20;
const RETRY_DELAY_MS = 50;

function sleepSync(durationMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
}

function isBusyError(error) {
  return error?.code === "ERR_SQLITE_ERROR" && SQLITE_BUSY_CODES.has(error?.errcode);
}

export class SqliteStateStore {
  constructor(filePath, documentKey) {
    this.filePath = filePath;
    this.documentKey = documentKey;
    this.database = null;
  }

  open() {
    if (this.database) return this.database;

    for (let attempt = 0; attempt < OPEN_RETRY_COUNT; attempt += 1) {
      let database;
      try {
        database = new DatabaseSync(this.filePath, { timeout: 5000 });
        database.exec("PRAGMA busy_timeout = 5000");
        database.exec("PRAGMA journal_mode = WAL");
        database.exec(`
          CREATE TABLE IF NOT EXISTS state_documents (
            document_key TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);
        this.database = database;
        return database;
      } catch (error) {
        try {
          database?.close?.();
        } catch {}
        if (!isBusyError(error) || attempt === OPEN_RETRY_COUNT - 1) {
          throw error;
        }
        sleepSync(RETRY_DELAY_MS);
      }
    }
  }

  withRetry(operation) {
    for (let attempt = 0; attempt < OPERATION_RETRY_COUNT; attempt += 1) {
      try {
        return operation();
      } catch (error) {
        if (!isBusyError(error) || attempt === OPERATION_RETRY_COUNT - 1) {
          throw error;
        }
        sleepSync(RETRY_DELAY_MS);
      }
    }
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const row = this.withRetry(() => this.open()
      .prepare("SELECT payload FROM state_documents WHERE document_key = ?")
      .get(this.documentKey));

    if (!row) {
      throw new Error(`Missing sqlite document: ${this.documentKey}`);
    }

    return JSON.parse(row.payload);
  }

  async loadOr(defaultValue) {
    try {
      return await this.load();
    } catch {
      await this.save(defaultValue);
      return defaultValue;
    }
  }

  async save(value) {
    await mkdir(dirname(this.filePath), { recursive: true });
    this.withRetry(() => this.open()
      .prepare(`
        INSERT INTO state_documents (document_key, payload, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(document_key) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `)
      .run(this.documentKey, JSON.stringify(value, null, 2), new Date().toISOString()));
  }
}
