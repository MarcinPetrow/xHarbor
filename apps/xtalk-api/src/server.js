import http from "node:http";
import { createDemoTalkState } from "@xharbor/contracts";
import { AuthorizationError, authorize, permissions } from "@xharbor/platform-auth";
import { SqliteStateStore } from "@xharbor/sqlite-store";
import { SessionStore, parseCookies, sessionCookieName } from "@xharbor/platform-session";
import {
  canAccessDirectConversation,
  canManageTeamRoom,
  canPostToRoom,
  createMessage,
  createRoom,
  directConversationID,
  isAuthenticated,
  isRoomArchived,
  membershipsForUser,
  unreadCount,
  upsertReadState
} from "./chat.js";

const port = 8083;
const xgroupBaseURL = "http://127.0.0.1:8080";
const stateStore = new SqliteStateStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname, "xtalk");
const sessionStore = new SessionStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname);
let state = await stateStore.loadOr(createDemoTalkState());
const streamClients = new Set();

function json(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function text(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(message)
  });
  response.end(message);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body ? JSON.parse(body) : {}));
    request.on("error", reject);
  });
}

async function resolveActingUserID(request) {
  if (request.headers["x-user-id"]) return request.headers["x-user-id"];
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[sessionCookieName()];
  const session = await sessionStore.getSession(token);
  return session?.userID ?? null;
}

async function persist() {
  await stateStore.save(state);
}

function nextEventID() {
  return (state.events.at(-1)?.id ?? 0) + 1;
}

function publishEvent(name, aggregateID, actorUserID, detail = {}) {
  const event = {
    id: nextEventID(),
    name,
    aggregateID,
    actorUserID,
    createdAt: new Date().toISOString(),
    detail
  };
  state.events.push(event);
  const payload = `id: ${event.id}\nevent: ${event.name}\ndata: ${JSON.stringify(event)}\n\n`;

  for (const client of streamClients) {
    client.write(payload);
  }
}

async function refreshWorkspace() {
  try {
    const response = await fetch(`${xgroupBaseURL}/api/workspace`);
    const payload = await response.json();
    state.workspace = payload.snapshot;
    state.syncStatus = {
      source: xgroupBaseURL,
      lastSyncAt: new Date().toISOString(),
      lastSyncSucceeded: true,
      lastError: null
    };
    await persist();
  } catch (error) {
    state.syncStatus = {
      source: xgroupBaseURL,
      lastSyncAt: new Date().toISOString(),
      lastSyncSucceeded: false,
      lastError: String(error.message || error)
    };
    await persist();
  }
}

function requireAuthenticated(actingUserID) {
  if (!actingUserID) {
    throw new AuthorizationError(401, "Missing active session.");
  }
  if (!isAuthenticated(state.workspace, actingUserID)) {
    throw new AuthorizationError(401, `Unknown acting user: ${actingUserID}`);
  }
}

function buildPayload(actingUserID) {
  const userMemberships = membershipsForUser(state.workspace, actingUserID);
  const visibleRooms = state.rooms.filter((room) =>
    userMemberships.some((membership) => membership.teamID === room.teamID)
  );
  const activeRooms = visibleRooms.filter((room) => !isRoomArchived(room));
  const archivedRooms = visibleRooms.filter((room) => isRoomArchived(room));
  const visibleRoomIDs = new Set(activeRooms.map((room) => room.id));
  const visibleDMs = state.directConversations.filter((conversation) =>
    canAccessDirectConversation(actingUserID, conversation)
  );
  const visibleDMIDs = new Set(visibleDMs.map((conversation) => conversation.id));
  const visibleReadStates = state.readStates.filter((item) =>
    item.userID === actingUserID && (visibleRoomIDs.has(item.conversationID) || visibleDMIDs.has(item.conversationID))
  );

  return {
    workspace: state.workspace,
    rooms: activeRooms,
    archivedRooms,
    roomMessages: state.roomMessages.filter((message) => visibleRoomIDs.has(message.conversationID)),
    directConversations: visibleDMs,
    directMessages: state.directMessages.filter((message) => visibleDMIDs.has(message.conversationID)),
    readStates: visibleReadStates,
    roomUnread: Object.fromEntries(
      activeRooms.map((room) => {
        const lastReadAt = visibleReadStates.find((item) => item.conversationID === room.id)?.lastReadAt ?? null;
        const messages = state.roomMessages.filter((message) => message.conversationID === room.id);
        return [room.id, unreadCount(messages, lastReadAt, actingUserID)];
      })
    ),
    directUnread: Object.fromEntries(
      visibleDMs.map((conversation) => {
        const lastReadAt = visibleReadStates.find((item) => item.conversationID === conversation.id)?.lastReadAt ?? null;
        const messages = state.directMessages.filter((message) => message.conversationID === conversation.id);
        return [conversation.id, unreadCount(messages, lastReadAt, actingUserID)];
      })
    ),
    syncStatus: state.syncStatus
  };
}

async function markConversationRead(actingUserID, conversationID, messages) {
  const lastReadAt = messages.length
    ? messages.reduce((latest, message) => (
      new Date(message.createdAt).getTime() > new Date(latest).getTime() ? message.createdAt : latest
    ), messages[0].createdAt)
    : new Date().toISOString();
  const readState = upsertReadState(state.readStates, actingUserID, conversationID, lastReadAt);
  await persist();
  return readState;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const actingUserID = await resolveActingUserID(request);

    if (request.method === "GET" && url.pathname === "/api/chat") {
      requireAuthenticated(actingUserID);
      return json(response, 200, buildPayload(actingUserID));
    }

    if (request.method === "GET" && url.pathname === "/api/chat/stream") {
      requireAuthenticated(actingUserID);

      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "Connection": "keep-alive"
      });
      response.write(`event: xtalk.ready\ndata: ${JSON.stringify({ userID: actingUserID })}\n\n`);
      streamClients.add(response);
      request.on("close", () => {
        streamClients.delete(response);
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/chat/refresh-workspace") {
      authorize(state.workspace, actingUserID, permissions.manageBacklog);
      await refreshWorkspace();
      publishEvent("xtalk.workspace.synced", "workspace", actingUserID, {
        lastSyncAt: state.syncStatus.lastSyncAt
      });
      await persist();
      return json(response, 200, state.syncStatus);
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      requireAuthenticated(actingUserID);
      await refreshWorkspace();
      const payload = await readBody(request);
      if (!state.workspace.teams.some((team) => team.id === payload.teamID)) {
        return text(response, 400, `Unknown team: ${payload.teamID}`);
      }
      if (!canManageTeamRoom(state.workspace, actingUserID, payload.teamID)) {
        throw new AuthorizationError(403, `Forbidden for room creation in team: ${payload.teamID}`);
      }
      const room = createRoom(payload.name, payload.teamID);
      state.rooms.push(room);
      upsertReadState(state.readStates, actingUserID, room.id, new Date().toISOString());
      publishEvent("xtalk.room.created", room.id, actingUserID, {
        teamID: room.teamID,
        name: room.name
      });
      await persist();
      return json(response, 201, room);
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/messages$/)) {
      requireAuthenticated(actingUserID);
      const roomID = url.pathname.split("/")[3];
      const room = state.rooms.find((item) => item.id === roomID);
      if (!room) {
        return text(response, 404, `Unknown room: ${roomID}`);
      }
      if (isRoomArchived(room)) {
        return text(response, 409, `Archived room cannot accept messages: ${roomID}`);
      }
      if (!canPostToRoom(state.workspace, actingUserID, room)) {
        throw new AuthorizationError(403, `Forbidden for room messaging: ${roomID}`);
      }
      const payload = await readBody(request);
      const message = createMessage("msg-room", room.id, actingUserID, payload.body);
      state.roomMessages.push(message);
      upsertReadState(state.readStates, actingUserID, room.id, message.createdAt);
      publishEvent("xtalk.room.message.created", room.id, actingUserID, {
        messageID: message.id
      });
      await persist();
      return json(response, 201, message);
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/read$/)) {
      requireAuthenticated(actingUserID);
      const roomID = url.pathname.split("/")[3];
      const room = state.rooms.find((item) => item.id === roomID);
      if (!room) {
        return text(response, 404, `Unknown room: ${roomID}`);
      }
      if (!canPostToRoom(state.workspace, actingUserID, room)) {
        throw new AuthorizationError(403, `Forbidden for room read state: ${roomID}`);
      }
      const readState = await markConversationRead(
        actingUserID,
        roomID,
        state.roomMessages.filter((message) => message.conversationID === roomID)
      );
      publishEvent("xtalk.room.read", roomID, actingUserID, { lastReadAt: readState.lastReadAt });
      return json(response, 200, readState);
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/archive$/)) {
      requireAuthenticated(actingUserID);
      const roomID = url.pathname.split("/")[3];
      const room = state.rooms.find((item) => item.id === roomID);
      if (!room) {
        return text(response, 404, `Unknown room: ${roomID}`);
      }
      if (!canManageTeamRoom(state.workspace, actingUserID, room.teamID)) {
        throw new AuthorizationError(403, `Forbidden for room archive: ${roomID}`);
      }
      room.archivedAt = new Date().toISOString();
      room.archivedByUserID = actingUserID;
      publishEvent("xtalk.room.archived", roomID, actingUserID, { archivedAt: room.archivedAt });
      await persist();
      return json(response, 200, room);
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/restore$/)) {
      requireAuthenticated(actingUserID);
      const roomID = url.pathname.split("/")[3];
      const room = state.rooms.find((item) => item.id === roomID);
      if (!room) {
        return text(response, 404, `Unknown room: ${roomID}`);
      }
      if (!canManageTeamRoom(state.workspace, actingUserID, room.teamID)) {
        throw new AuthorizationError(403, `Forbidden for room restore: ${roomID}`);
      }
      room.archivedAt = null;
      room.archivedByUserID = null;
      publishEvent("xtalk.room.restored", roomID, actingUserID);
      await persist();
      return json(response, 200, room);
    }

    if (request.method === "POST" && url.pathname === "/api/direct-conversations") {
      requireAuthenticated(actingUserID);
      await refreshWorkspace();
      const payload = await readBody(request);
      if (!state.workspace.users.some((user) => user.id === payload.participantUserID)) {
        return text(response, 400, `Unknown user: ${payload.participantUserID}`);
      }
      if (payload.participantUserID === actingUserID) {
        return text(response, 400, "Direct conversation requires a second participant");
      }
      const conversationID = directConversationID(actingUserID, payload.participantUserID);
      let conversation = state.directConversations.find((item) => item.id === conversationID);
      if (!conversation) {
        conversation = {
          id: conversationID,
          participantUserIDs: [actingUserID, payload.participantUserID].sort()
        };
        state.directConversations.push(conversation);
        upsertReadState(state.readStates, actingUserID, conversation.id, new Date().toISOString());
        publishEvent("xtalk.direct.created", conversation.id, actingUserID, {
          participantUserIDs: conversation.participantUserIDs
        });
        await persist();
      }
      return json(response, 201, conversation);
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/direct-conversations\/[^/]+\/messages$/)) {
      requireAuthenticated(actingUserID);
      const conversationID = url.pathname.split("/")[3];
      const conversation = state.directConversations.find((item) => item.id === conversationID);
      if (!conversation) {
        return text(response, 404, `Unknown direct conversation: ${conversationID}`);
      }
      if (!canAccessDirectConversation(actingUserID, conversation)) {
        throw new AuthorizationError(403, `Forbidden for direct conversation: ${conversationID}`);
      }
      const payload = await readBody(request);
      const message = createMessage("msg-dm", conversation.id, actingUserID, payload.body);
      state.directMessages.push(message);
      upsertReadState(state.readStates, actingUserID, conversation.id, message.createdAt);
      publishEvent("xtalk.direct.message.created", conversation.id, actingUserID, {
        messageID: message.id
      });
      await persist();
      return json(response, 201, message);
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/direct-conversations\/[^/]+\/read$/)) {
      requireAuthenticated(actingUserID);
      const conversationID = url.pathname.split("/")[3];
      const conversation = state.directConversations.find((item) => item.id === conversationID);
      if (!conversation) {
        return text(response, 404, `Unknown direct conversation: ${conversationID}`);
      }
      if (!canAccessDirectConversation(actingUserID, conversation)) {
        throw new AuthorizationError(403, `Forbidden for direct conversation: ${conversationID}`);
      }
      const readState = await markConversationRead(
        actingUserID,
        conversationID,
        state.directMessages.filter((message) => message.conversationID === conversationID)
      );
      publishEvent("xtalk.direct.read", conversationID, actingUserID, { lastReadAt: readState.lastReadAt });
      return json(response, 200, readState);
    }

    return text(response, 404, "Not Found");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return text(response, error.statusCode, error.message);
    }
    return text(response, 400, String(error.message || error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`xtalk-api listening on http://127.0.0.1:${port}`);
});
