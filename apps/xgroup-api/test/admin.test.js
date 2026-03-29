import test from "node:test";
import assert from "node:assert/strict";
import { createDemoWorkspace } from "@xharbor/contracts";
import {
  assertKnownUserStatus,
  assertKnownRole,
  createMembership,
  removeMembership,
  teamMembershipCount,
  updateMembershipRole,
  updateUserMembership
} from "../src/admin.js";

test("updateUserMembership rewrites existing membership", () => {
  const state = createDemoWorkspace();
  updateUserMembership(state, "user-anna", "team-core", "admin");

  const membership = state.snapshot.memberships.find((item) => item.userID === "user-anna");
  assert.equal(membership.teamID, "team-core");
  assert.equal(membership.role, "admin");
});

test("teamMembershipCount returns active membership total", () => {
  const state = createDemoWorkspace();
  assert.equal(teamMembershipCount(state, "team-mobile"), 1);
});

test("assertKnownRole rejects unsupported role", () => {
  assert.throws(() => assertKnownRole("lead"), /Invalid team role/);
});

test("assertKnownUserStatus rejects unsupported status", () => {
  assert.throws(() => assertKnownUserStatus("deleted"), /Invalid user status/);
});

test("createMembership supports multiple team memberships per user", () => {
  const state = createDemoWorkspace();
  createMembership(state, "user-anna", "team-core", "member");

  const memberships = state.snapshot.memberships.filter((item) => item.userID === "user-anna");
  assert.equal(memberships.length, 2);
  assert.equal(memberships.some((item) => item.teamID === "team-core" && item.role === "member"), true);
});

test("updateMembershipRole changes only selected membership", () => {
  const state = createDemoWorkspace();
  createMembership(state, "user-anna", "team-core", "member");
  updateMembershipRole(state, "user-anna", "team-core", "admin");

  assert.equal(
    state.snapshot.memberships.some((item) => item.userID === "user-anna" && item.teamID === "team-core" && item.role === "admin"),
    true
  );
  assert.equal(
    state.snapshot.memberships.some((item) => item.userID === "user-anna" && item.teamID === "team-product" && item.role === "manager"),
    true
  );
});

test("removeMembership drops only requested membership", () => {
  const state = createDemoWorkspace();
  createMembership(state, "user-anna", "team-core", "member");
  const removed = removeMembership(state, "user-anna", "team-core");

  assert.equal(removed, true);
  assert.equal(state.snapshot.memberships.some((item) => item.userID === "user-anna" && item.teamID === "team-core"), false);
  assert.equal(state.snapshot.memberships.some((item) => item.userID === "user-anna" && item.teamID === "team-product"), true);
});
