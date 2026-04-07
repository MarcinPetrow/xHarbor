import http from "node:http";
import { createDemoWorkspace, slugify } from "@xharbor/contracts";
import { AuthorizationError, authorize, permissions } from "@xharbor/platform-auth";
import { SqliteStateStore } from "@xharbor/sqlite-store";
import {
  SessionStore,
  clearSessionCookie,
  isKnownSessionPresence,
  makeSessionCookie,
  parseCookies,
  sessionCookieName
} from "@xharbor/platform-session";
import {
  assertKnownUserStatus,
  assertKnownRole,
  createMembership,
  findMembership,
  findTeam,
  findUser,
  membershipsForUser,
  removeMembership,
  teamMembershipCount,
  updateMembershipRole,
  updateUserMembership
} from "./admin.js";
import { acceptInvitation, createInvitation, revokeInvitation } from "./invitations.js";

const port = 8080;
const stateStore = new SqliteStateStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname, "xgroup");
const sessionStore = new SessionStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname);
let state = await stateStore.loadOr({
  ...createDemoWorkspace(),
  invitations: []
});

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

async function resolveActingUserID(request) {
  if (request.headers["x-user-id"]) return request.headers["x-user-id"];
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[sessionCookieName()];
  const session = await sessionStore.getSession(token);
  return session?.userID ?? null;
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

async function persist() {
  await stateStore.save(state);
}

function computeDisplayName(payload) {
  const fullName = [payload.firstName, payload.lastName].filter(Boolean).join(" ").trim();
  return fullName || payload.nickname || payload.email || "Unknown User";
}

function normalizeAvatarDataURL(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,/i.test(value)) {
    throw new Error("Avatar must be a data URL for an image file.");
  }
  if (value.length > 2_500_000) {
    throw new Error("Avatar image is too large.");
  }
  return value;
}

async function listPresence() {
  const sessions = await sessionStore.listSessions();
  const sessionsByUserID = new Map();

  for (const session of sessions) {
    if (!state.snapshot.users.some((user) => user.id === session.userID && user.status === "active")) {
      continue;
    }
    const items = sessionsByUserID.get(session.userID) ?? [];
    items.push(session);
    sessionsByUserID.set(session.userID, items);
  }

  return state.snapshot.users.map((user) => ({
    userID: user.id,
    status: user.status,
    presence: sessionsByUserID.has(user.id)
      ? sessionsByUserID.get(user.id).some((session) => session.presence === "online")
        ? "online"
        : "brb"
      : "offline",
    isOnline: sessionsByUserID.has(user.id)
  }));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/workspace") {
      return json(response, 200, state);
    }

    if (request.method === "GET" && url.pathname === "/api/teams") {
      return json(response, 200, state.snapshot.teams);
    }

    if (request.method === "GET" && url.pathname === "/api/users") {
      return json(response, 200, state.snapshot.users);
    }

    if (request.method === "GET" && url.pathname.match(/^\/api\/users\/[^/]+$/)) {
      const userID = url.pathname.split("/")[3];
      const user = findUser(state, userID);
      if (!user) {
        return text(response, 404, `Unknown user: ${userID}`);
      }
      return json(response, 200, user);
    }

    if (request.method === "GET" && url.pathname === "/api/memberships") {
      return json(response, 200, state.snapshot.memberships);
    }

    if (request.method === "GET" && url.pathname === "/api/invitations") {
      return json(response, 200, state.invitations);
    }

    if (request.method === "GET" && url.pathname === "/api/presence") {
      return json(response, 200, await listPresence());
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      const cookies = parseCookies(request.headers.cookie);
      const token = cookies[sessionCookieName()];
      const session = await sessionStore.getSession(token);
      const actingUserID = session?.userID ?? null;
      if (!actingUserID) {
        return json(response, 200, { authenticated: false, user: null, expiresAt: null });
      }
      const user = state.snapshot.users.find((item) => item.id === actingUserID) ?? null;
      if (!user || user.status !== "active") {
        return json(response, 200, { authenticated: false, user: null, expiresAt: null });
      }
      return json(response, 200, { authenticated: true, user, expiresAt: session?.expiresAt ?? null });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/sessions") {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const sessions = await sessionStore.listSessions();
      return json(response, 200, sessions.map((session) => ({
        token: session.token,
        userID: session.userID,
        user: state.snapshot.users.find((item) => item.id === session.userID) ?? null,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      })));
    }

    if (request.method === "POST" && url.pathname === "/api/session") {
      const payload = await readBody(request);
      const user = state.snapshot.users.find((item) => item.id === payload.userID);
      if (!user) {
        return text(response, 400, `Unknown user: ${payload.userID}`);
      }
      if (user.status !== "active") {
        return text(response, 403, `Inactive user cannot sign in: ${payload.userID}`);
      }
      const token = await sessionStore.createSession(user.id);
      const session = await sessionStore.getSession(token);
      const body = JSON.stringify({ authenticated: true, user, expiresAt: session?.expiresAt ?? null }, null, 2);
      response.writeHead(201, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Set-Cookie": makeSessionCookie(token),
        "Cache-Control": "no-store"
      });
      return response.end(body);
    }

    if (request.method === "DELETE" && url.pathname === "/api/session") {
      const cookies = parseCookies(request.headers.cookie);
      const token = cookies[sessionCookieName()];
      if (token) {
        await sessionStore.deleteSession(token);
      }
      response.writeHead(204, {
        "Set-Cookie": clearSessionCookie(),
        "Cache-Control": "no-store"
      });
      return response.end();
    }

    if (request.method === "POST" && url.pathname === "/api/session/presence") {
      const cookies = parseCookies(request.headers.cookie);
      const token = cookies[sessionCookieName()];
      const session = await sessionStore.getSession(token);
      if (!session) {
        return text(response, 401, "Missing active session.");
      }

      const payload = await readBody(request);
      if (!isKnownSessionPresence(payload.presence)) {
        return text(response, 400, `Unknown presence: ${payload.presence}`);
      }

      const updated = await sessionStore.updateSessionPresence(token, payload.presence);
      return json(response, 200, updated);
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/api\/admin\/sessions\/[^/]+$/)) {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const token = url.pathname.split("/")[4];
      await sessionStore.deleteSession(token);
      response.writeHead(204, { "Cache-Control": "no-store" });
      return response.end();
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/api\/admin\/users\/[^/]+\/sessions$/)) {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const userID = url.pathname.split("/")[4];
      const user = findUser(state, userID);
      if (!user) {
        return text(response, 404, `Unknown user: ${userID}`);
      }
      await sessionStore.deleteSessionsForUser(userID);
      response.writeHead(204, { "Cache-Control": "no-store" });
      return response.end();
    }

    if (request.method === "POST" && url.pathname === "/api/teams") {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const payload = await readBody(request);
      const team = {
        id: `team-${slugify(payload.name)}`,
        organizationID: state.snapshot.organization.id,
        name: payload.name
      };
      state.snapshot.teams.push(team);
      state.events.push({ name: "xgroup.team.created", aggregateID: team.id, context: "xGroup" });
      await persist();
      return json(response, 201, team);
    }

    if (request.method === "POST" && url.pathname === "/api/users") {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const payload = await readBody(request);
      assertKnownRole(payload.role);
      if (!state.snapshot.teams.some((item) => item.id === payload.teamID)) {
        return text(response, 400, `Unknown team: ${payload.teamID}`);
      }
      if (payload.managerUserID && !state.snapshot.users.some((item) => item.id === payload.managerUserID)) {
        return text(response, 400, `Unknown manager: ${payload.managerUserID}`);
      }
      let avatarDataURL;
      try {
        avatarDataURL = normalizeAvatarDataURL(payload.avatarDataURL);
      } catch (error) {
        return text(response, 400, error.message);
      }
      const user = {
        id: `user-${slugify(computeDisplayName(payload))}`,
        displayName: computeDisplayName(payload),
        firstName: payload.firstName,
        lastName: payload.lastName,
        nickname: payload.nickname || null,
        department: payload.department || "",
        title: payload.title || "",
        managerUserID: payload.managerUserID || null,
        avatarDataURL,
        email: payload.email,
        status: payload.status
      };
      assertKnownUserStatus(user.status);
      state.snapshot.users.push(user);
      state.snapshot.memberships.push({
        userID: user.id,
        teamID: payload.teamID,
        role: payload.role
      });
      state.events.push({ name: "xgroup.user.provisioned", aggregateID: user.id, context: "xGroup" });
      await persist();
      return json(response, 201, user);
    }

    if (request.method === "POST" && url.pathname === "/api/memberships") {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const payload = await readBody(request);
      assertKnownRole(payload.role);
      if (!findUser(state, payload.userID)) {
        return text(response, 400, `Unknown user: ${payload.userID}`);
      }
      if (!findTeam(state, payload.teamID)) {
        return text(response, 400, `Unknown team: ${payload.teamID}`);
      }
      createMembership(state, payload.userID, payload.teamID, payload.role);
      state.events.push({
        name: "xgroup.membership.created",
        aggregateID: `${payload.userID}:${payload.teamID}`,
        context: "xGroup"
      });
      await persist();
      return json(response, 201, { userID: payload.userID, teamID: payload.teamID, role: payload.role });
    }

    if (request.method === "POST" && url.pathname === "/api/invitations") {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const payload = await readBody(request);
      assertKnownRole(payload.role);
      if (!findTeam(state, payload.teamID)) {
        return text(response, 400, `Unknown team: ${payload.teamID}`);
      }
      const invitation = createInvitation(state, payload);
      state.events.push({
        name: "xgroup.invitation.created",
        aggregateID: invitation.id,
        context: "xGroup"
      });
      await persist();
      return json(response, 201, invitation);
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/invitations\/[^/]+\/accept$/)) {
      const invitationID = url.pathname.split("/")[3];
      const payload = await readBody(request);
      const result = acceptInvitation(state, invitationID, payload.displayName, createMembership);
      state.events.push({
        name: "xgroup.invitation.accepted",
        aggregateID: invitationID,
        context: "xGroup"
      });
      state.events.push({
        name: "xgroup.user.provisioned",
        aggregateID: result.user.id,
        context: "xGroup"
      });
      await persist();
      return json(response, 201, result);
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/invitations\/[^/]+\/revoke$/)) {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const invitationID = url.pathname.split("/")[3];
      const invitation = revokeInvitation(state, invitationID);
      state.events.push({
        name: "xgroup.invitation.revoked",
        aggregateID: invitation.id,
        context: "xGroup"
      });
      await persist();
      return json(response, 200, invitation);
    }

    if (request.method === "PATCH" && url.pathname.match(/^\/api\/teams\/[^/]+$/)) {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const teamID = url.pathname.split("/")[3];
      const team = findTeam(state, teamID);
      if (!team) {
        return text(response, 404, `Unknown team: ${teamID}`);
      }
      const payload = await readBody(request);
      team.name = payload.name;
      state.events.push({ name: "xgroup.team.updated", aggregateID: team.id, context: "xGroup" });
      await persist();
      return json(response, 200, team);
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/api\/teams\/[^/]+$/)) {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const teamID = url.pathname.split("/")[3];
      const team = findTeam(state, teamID);
      if (!team) {
        return text(response, 404, `Unknown team: ${teamID}`);
      }
      if (teamMembershipCount(state, teamID) > 0) {
        return text(response, 409, `Cannot delete team with active memberships: ${teamID}`);
      }
      state.snapshot.teams = state.snapshot.teams.filter((item) => item.id !== teamID);
      state.events.push({ name: "xgroup.team.deleted", aggregateID: teamID, context: "xGroup" });
      await persist();
      response.writeHead(204, { "Cache-Control": "no-store" });
      return response.end();
    }

    if (request.method === "PATCH" && url.pathname.match(/^\/api\/users\/[^/]+$/)) {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const userID = url.pathname.split("/")[3];
      const user = findUser(state, userID);
      if (!user) {
        return text(response, 404, `Unknown user: ${userID}`);
      }
      const payload = await readBody(request);
      if (payload.managerUserID && !state.snapshot.users.some((item) => item.id === payload.managerUserID)) {
        return text(response, 400, `Unknown manager: ${payload.managerUserID}`);
      }
      user.firstName = payload.firstName;
      user.lastName = payload.lastName;
      user.nickname = payload.nickname || null;
      user.department = payload.department || "";
      user.title = payload.title || "";
      user.managerUserID = payload.managerUserID || null;
      user.displayName = computeDisplayName(payload);
      user.email = payload.email;
      if (Object.hasOwn(payload, "avatarDataURL")) {
        try {
          user.avatarDataURL = normalizeAvatarDataURL(payload.avatarDataURL);
        } catch (error) {
          return text(response, 400, error.message);
        }
      }
      if (payload.status) {
        assertKnownUserStatus(payload.status);
        user.status = payload.status;
        if (payload.status !== "active") {
          await sessionStore.deleteSessionsForUser(userID);
        }
      }
      if (payload.teamID && payload.role) {
        assertKnownRole(payload.role);
        if (!state.snapshot.teams.some((item) => item.id === payload.teamID)) {
          return text(response, 400, `Unknown team: ${payload.teamID}`);
        }
        updateUserMembership(state, userID, payload.teamID, payload.role);
      }
      state.events.push({ name: "xgroup.user.updated", aggregateID: userID, context: "xGroup" });
      await persist();
      return json(response, 200, user);
    }

    if (request.method === "PATCH" && url.pathname.match(/^\/api\/memberships\/[^/]+\/[^/]+$/)) {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const [, , , userID, teamID] = url.pathname.split("/");
      if (!findMembership(state, userID, teamID)) {
        return text(response, 404, `Unknown membership: ${userID} in ${teamID}`);
      }
      const payload = await readBody(request);
      assertKnownRole(payload.role);
      updateMembershipRole(state, userID, teamID, payload.role);
      state.events.push({
        name: "xgroup.membership.updated",
        aggregateID: `${userID}:${teamID}`,
        context: "xGroup"
      });
      await persist();
      return json(response, 200, { userID, teamID, role: payload.role });
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/api\/users\/[^/]+$/)) {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const userID = url.pathname.split("/")[3];
      const user = findUser(state, userID);
      if (!user) {
        return text(response, 404, `Unknown user: ${userID}`);
      }
      state.snapshot.users = state.snapshot.users.filter((item) => item.id !== userID);
      state.snapshot.memberships = state.snapshot.memberships.filter((item) => item.userID !== userID);
      await sessionStore.deleteSessionsForUser(userID);
      state.events.push({ name: "xgroup.user.deleted", aggregateID: userID, context: "xGroup" });
      await persist();
      response.writeHead(204, { "Cache-Control": "no-store" });
      return response.end();
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/api\/memberships\/[^/]+\/[^/]+$/)) {
      authorize(state.snapshot, await resolveActingUserID(request), permissions.manageDirectory);
      const [, , , userID, teamID] = url.pathname.split("/");
      if (!findUser(state, userID)) {
        return text(response, 404, `Unknown user: ${userID}`);
      }
      if (!findTeam(state, teamID)) {
        return text(response, 404, `Unknown team: ${teamID}`);
      }
      if (!findMembership(state, userID, teamID)) {
        return text(response, 404, `Unknown membership: ${userID} in ${teamID}`);
      }
      const membershipCount = membershipsForUser(state, userID).length;
      if (membershipCount <= 1) {
        return text(response, 409, `Cannot remove last active membership for user: ${userID}`);
      }
      removeMembership(state, userID, teamID);
      state.events.push({
        name: "xgroup.membership.deleted",
        aggregateID: `${userID}:${teamID}`,
        context: "xGroup"
      });
      await persist();
      response.writeHead(204, { "Cache-Control": "no-store" });
      return response.end();
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
  console.log(`xgroup-api listening on http://127.0.0.1:${port}`);
});
