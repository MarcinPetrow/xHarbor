import http from "node:http";
import { createDemoDashboardState } from "@xharbor/contracts";
import { AuthorizationError, authorize, permissions } from "@xharbor/platform-auth";
import { SqliteStateStore } from "@xharbor/sqlite-store";
import { SessionStore, parseCookies, sessionCookieName } from "@xharbor/platform-session";
import { buildDashboardPayload } from "./reporting.js";

const port = 8082;
const xgroupBaseURL = "http://127.0.0.1:8080";
const xbacklogBaseURL = "http://127.0.0.1:8081";
const stateStore = new SqliteStateStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname, "xdashboard");
const sessionStore = new SessionStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname);
let state = await stateStore.loadOr(createDemoDashboardState());

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

async function persist() {
  await stateStore.save(state);
}

async function refreshSnapshot() {
  try {
    const [workspaceResponse, backlogResponse] = await Promise.all([
      fetch(`${xgroupBaseURL}/api/workspace`),
      fetch(`${xbacklogBaseURL}/api/backlog`)
    ]);

    const workspacePayload = await workspaceResponse.json();
    const backlogPayload = await backlogResponse.json();

    state.snapshot = {
      workspace: workspacePayload.snapshot,
      backlog: {
        projects: backlogPayload.projects,
        tasks: backlogPayload.tasks,
        comments: backlogPayload.comments || [],
        taskEvents: backlogPayload.taskEvents || []
      }
    };
    state.syncStatus = {
      sources: {
        xgroup: xgroupBaseURL,
        xbacklog: xbacklogBaseURL
      },
      lastSyncAt: new Date().toISOString(),
      lastSyncSucceeded: true,
      lastError: null
    };
    await persist();
  } catch (error) {
    state.syncStatus = {
      sources: {
        xgroup: xgroupBaseURL,
        xbacklog: xbacklogBaseURL
      },
      lastSyncAt: new Date().toISOString(),
      lastSyncSucceeded: false,
      lastError: String(error.message || error)
    };
    await persist();
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      authorize(state.snapshot.workspace, await resolveActingUserID(request), permissions.viewDashboard);
      return json(response, 200, buildDashboardPayload(state));
    }

    if (request.method === "POST" && url.pathname === "/api/dashboard/refresh") {
      authorize(state.snapshot.workspace, await resolveActingUserID(request), permissions.manageBacklog);
      await refreshSnapshot();
      return json(response, 200, state.syncStatus);
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
  console.log(`xdashboard-api listening on http://127.0.0.1:${port}`);
});
