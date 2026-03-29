import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionStore, parseCookies } from "../src/index.js";

test("session store creates and reads session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xharbor-session-"));
  const store = new SessionStore(join(dir, "sessions.json"));

  const token = await store.createSession("user-1");
  const session = await store.getSession(token);

  assert.equal(session.userID, "user-1");
  assert.ok(session.expiresAt);
  assert.equal(session.presence, "online");
});

test("expired session is removed on read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xharbor-session-"));
  const store = new SessionStore(join(dir, "sessions.json"));
  const state = await store.loadState();

  state.sessions.expired = {
    userID: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:00:00.000Z"
  };
  await store.fileStore.save(state);

  const session = await store.getSession("expired");
  assert.equal(session, null);
});

test("listSessions returns live sessions and deleteSessionsForUser removes them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xharbor-session-"));
  const store = new SessionStore(join(dir, "sessions.json"));

  await store.createSession("user-1");
  await store.createSession("user-2");
  await store.createSession("user-1");

  const before = await store.listSessions();
  assert.equal(before.filter((session) => session.userID === "user-1").length, 2);

  await store.deleteSessionsForUser("user-1");
  const after = await store.listSessions();
  assert.equal(after.filter((session) => session.userID === "user-1").length, 0);
  assert.equal(after.filter((session) => session.userID === "user-2").length, 1);
});

test("updateSessionPresence stores explicit session presence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xharbor-session-"));
  const store = new SessionStore(join(dir, "sessions.json"));

  const token = await store.createSession("user-1");
  const updated = await store.updateSessionPresence(token, "brb");

  assert.equal(updated.presence, "brb");
  const session = await store.getSession(token);
  assert.equal(session.presence, "brb");
});

test("cookie parser returns key values", () => {
  const cookies = parseCookies("xharbor_session=abc123; theme=light");
  assert.equal(cookies.xharbor_session, "abc123");
  assert.equal(cookies.theme, "light");
});
