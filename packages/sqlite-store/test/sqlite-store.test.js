import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SqliteStateStore } from "../src/index.js";

test("sqlite store persists and reloads document", async () => {
  const root = mkdtempSync(join(tmpdir(), "xharbor-sqlite-"));
  const store = new SqliteStateStore(join(root, "state.db"), "workspace");

  await store.save({ ok: true, count: 3 });
  const state = await store.load();

  assert.deepEqual(state, { ok: true, count: 3 });
});

test("sqlite store tolerates concurrent bootstrap across processes", async () => {
  const root = mkdtempSync(join(tmpdir(), "xharbor-sqlite-concurrent-"));
  const filePath = join(root, "state.db");
  const fixturePath = fileURLToPath(new URL("./fixtures/concurrent-bootstrap.mjs", import.meta.url));
  const documentKeys = ["xgroup", "xbacklog", "xtalk", "sessions"];

  await Promise.all(documentKeys.map((documentKey) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fixturePath, filePath, documentKey], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `child exited with code ${code}`));
    });
    child.on("error", reject);
  })));

  for (const documentKey of documentKeys) {
    const store = new SqliteStateStore(filePath, documentKey);
    const state = await store.load();
    assert.equal(state.key, documentKey);
  }
});
