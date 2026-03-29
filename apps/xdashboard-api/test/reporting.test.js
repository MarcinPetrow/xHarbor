import test from "node:test";
import assert from "node:assert/strict";
import { createDemoDashboardState } from "@xharbor/contracts";
import { buildDashboardPayload } from "../src/reporting.js";

test("dashboard payload computes summary and risks", () => {
  const state = createDemoDashboardState();
  state.snapshot.backlog.tasks.push({
    id: "task-unassigned",
    projectID: "proj-core",
    title: "Investigate queue depth",
    assigneeUserID: null,
    description: "Investigate pressure on the async pipeline.",
    status: "new",
    createdAt: "2026-03-29T11:55:00.000Z",
    updatedAt: "2026-03-29T11:55:00.000Z",
    completedAt: null
  });
  state.snapshot.backlog.comments.push({
    id: "comment-task-unassigned-1",
    taskID: "task-unassigned",
    authorUserID: "user-marcin",
    body: "Waiting for infra signal.",
    createdAt: "2026-03-29T12:00:00.000Z"
  });

  const payload = buildDashboardPayload(state);

  assert.equal(payload.summary.teamCount, 3);
  assert.equal(payload.summary.projectCount, 2);
  assert.equal(payload.summary.unassignedTaskCount, 1);
  assert.equal(payload.summary.blockedTaskCount, 0);
  assert.equal(payload.summary.commentCount, 2);
  assert.ok(payload.risks.some((risk) => risk.id === "risk-unassigned-task-unassigned"));
  assert.ok(payload.risks.some((risk) => risk.id === "risk-team-team-mobile"));
  assert.equal(payload.recentComments[0].taskTitle, "Investigate queue depth");
});
