import test from "node:test";
import assert from "node:assert/strict";
import { AuthorizationError, authorize, permissions } from "../src/index.js";
import { createDemoWorkspace } from "@xharbor/contracts";

test("owner can manage directory", () => {
  const workspace = createDemoWorkspace().snapshot;
  const user = authorize(workspace, "user-marcin", permissions.manageDirectory);
  assert.equal(user.id, "user-marcin");
});

test("member cannot manage directory", () => {
  const workspace = createDemoWorkspace().snapshot;
  assert.throws(
    () => authorize(workspace, "user-ola", permissions.manageDirectory),
    (error) => error instanceof AuthorizationError && error.statusCode === 403
  );
});

test("member can view dashboard", () => {
  const workspace = createDemoWorkspace().snapshot;
  const user = authorize(workspace, "user-ola", permissions.viewDashboard);
  assert.equal(user.id, "user-ola");
});

test("member can view and edit docs", () => {
  const workspace = createDemoWorkspace().snapshot;
  assert.equal(authorize(workspace, "user-ola", permissions.viewDocs).id, "user-ola");
  assert.equal(authorize(workspace, "user-ola", permissions.editDocs).id, "user-ola");
});

test("suspended user cannot authorize", () => {
  const workspace = createDemoWorkspace().snapshot;
  workspace.users = workspace.users.map((user) => user.id === "user-ola" ? { ...user, status: "suspended" } : user);

  assert.throws(
    () => authorize(workspace, "user-ola", permissions.viewDashboard),
    (error) => error instanceof AuthorizationError && error.statusCode === 403 && /Inactive acting user/.test(error.message)
  );
});
