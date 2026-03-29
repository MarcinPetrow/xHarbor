import { slugify } from "@xharbor/contracts";

export function isAuthenticated(workspace, actingUserID) {
  return workspace.users.some((user) => user.id === actingUserID && user.status === "active");
}

export function membershipsForUser(workspace, actingUserID) {
  return workspace.memberships.filter((membership) => membership.userID === actingUserID);
}

export function canManageTeamRoom(workspace, actingUserID, teamID) {
  return membershipsForUser(workspace, actingUserID).some((membership) =>
    membership.teamID === teamID &&
    (membership.role === "owner" || membership.role === "admin" || membership.role === "manager")
  );
}

export function canPostToRoom(workspace, actingUserID, room) {
  return membershipsForUser(workspace, actingUserID).some((membership) => membership.teamID === room.teamID);
}

export function canAccessDirectConversation(actingUserID, conversation) {
  return conversation.participantUserIDs.includes(actingUserID);
}

export function isRoomArchived(room) {
  return Boolean(room.archivedAt);
}

export function directConversationID(userA, userB) {
  return `dm-${[userA, userB].sort().join("-")}`;
}

export function createRoom(name, teamID) {
  return {
    id: `room-${slugify(name)}`,
    teamID,
    name,
    archivedAt: null,
    archivedByUserID: null
  };
}

export function createMessage(prefix, conversationID, authorUserID, body) {
  return {
    id: `${prefix}-${slugify(`${conversationID}-${body}`)}-${Date.now()}`,
    conversationID,
    authorUserID,
    body,
    createdAt: new Date().toISOString()
  };
}

export function unreadCount(messages, lastReadAt, actingUserID) {
  return messages.filter((message) => {
    if (message.authorUserID === actingUserID) return false;
    if (!lastReadAt) return true;
    return new Date(message.createdAt).getTime() > new Date(lastReadAt).getTime();
  }).length;
}

export function upsertReadState(readStates, userID, conversationID, lastReadAt) {
  const existing = readStates.find((item) => item.userID === userID && item.conversationID === conversationID);
  if (existing) {
    existing.lastReadAt = lastReadAt;
    return existing;
  }

  const readState = { userID, conversationID, lastReadAt };
  readStates.push(readState);
  return readState;
}
