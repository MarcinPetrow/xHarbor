import test from "node:test";
import assert from "node:assert/strict";
import { assertKnownTaskStatus, transitionTask } from "../src/workflow.js";

test("assertKnownTaskStatus rejects unsupported values", () => {
  assert.throws(() => assertKnownTaskStatus("queued"), /Unknown task status/);
});

test("transitionTask updates status and completion timestamp", () => {
  const task = {
    id: "task-1",
    status: "in_progress",
    updatedAt: "2026-03-29T10:00:00.000Z",
    completedAt: null
  };
  const taskEvents = [];

  const event = transitionTask(task, "done", "user-marcin", taskEvents);

  assert.equal(task.status, "done");
  assert.ok(task.completedAt);
  assert.equal(taskEvents.length, 1);
  assert.equal(event.type, "task.status.changed");
});
