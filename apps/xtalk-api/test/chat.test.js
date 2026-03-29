import test from "node:test";
import assert from "node:assert/strict";
import { createDemoTalkState } from "@xharbor/contracts";
import {
  canManageTeamRoom,
  canPostToRoom,
  createRoom,
  directConversationID,
  isAuthenticated,
  isRoomArchived,
  unreadCount,
  upsertReadState
} from "../src/chat.js";

test("owner can manage room for own team", () => {
  const state = createDemoTalkState();
  assert.equal(canManageTeamRoom(state.workspace, "user-marcin", "team-core"), true);
  assert.equal(canManageTeamRoom(state.workspace, "user-ola", "team-mobile"), false);
});

test("member can post to room in own team", () => {
  const state = createDemoTalkState();
  const room = { id: "room-mobile", teamID: "team-mobile", name: "Messaging Clients" };
  assert.equal(canPostToRoom(state.workspace, "user-ola", room), true);
  assert.equal(canPostToRoom(state.workspace, "user-anna", room), false);
});

test("suspended user is not authenticated for chat access", () => {
  const state = createDemoTalkState();
  state.workspace.users = state.workspace.users.map((user) => user.id === "user-ola" ? { ...user, status: "suspended" } : user);
  assert.equal(isAuthenticated(state.workspace, "user-ola"), false);
});

test("room and dm ids are stable", () => {
  assert.equal(createRoom("Platform Core", "team-core").id, "room-platform-core");
  assert.equal(directConversationID("user-marcin", "user-anna"), "dm-user-anna-user-marcin");
  assert.equal(createRoom("Platform Core", "team-core").archivedAt, null);
});

test("isRoomArchived returns true only for archived rooms", () => {
  assert.equal(isRoomArchived({ archivedAt: null }), false);
  assert.equal(isRoomArchived({ archivedAt: "2026-03-29T10:00:00.000Z" }), true);
});

test("unreadCount excludes own messages and respects lastReadAt", () => {
  const state = createDemoTalkState();
  const messages = [
    ...state.roomMessages,
    {
      id: "msg-room-3",
      conversationID: "room-platform-core",
      authorUserID: "user-anna",
      body: "Need decision on rollout window.",
      createdAt: "2026-03-29T10:30:00.000Z"
    }
  ].filter((message) => message.conversationID === "room-platform-core");

  assert.equal(unreadCount(messages, "2026-03-29T10:00:00.000Z", "user-marcin"), 1);
  assert.equal(unreadCount(messages, "2026-03-29T10:31:00.000Z", "user-marcin"), 0);
});

test("upsertReadState creates and updates read markers", () => {
  const readStates = [];
  upsertReadState(readStates, "user-marcin", "room-platform-core", "2026-03-29T10:00:00.000Z");
  upsertReadState(readStates, "user-marcin", "room-platform-core", "2026-03-29T10:45:00.000Z");

  assert.equal(readStates.length, 1);
  assert.equal(readStates[0].lastReadAt, "2026-03-29T10:45:00.000Z");
});
