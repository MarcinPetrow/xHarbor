import http from "node:http";
import { createDemoDocsState } from "@xharbor/contracts";
import { AuthorizationError, authorize, permissions } from "@xharbor/platform-auth";
import { SqliteStateStore } from "@xharbor/sqlite-store";
import { SessionStore, parseCookies, sessionCookieName } from "@xharbor/platform-session";
import { buildPageTree, createPage, listPageRevisions, updatePage } from "./docs.js";

const port = 8084;
const xgroupBaseURL = "http://127.0.0.1:8080";
const stateStore = new SqliteStateStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname, "xdoc");
const sessionStore = new SessionStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname);
let state = await stateStore.loadOr(createDemoDocsState());

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
    "Content-Length": Buffer.byteLength(message),
    "Cache-Control": "no-store"
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

function docsPayload() {
  return {
    snapshot: state.snapshot,
    pages: state.pages,
    tree: buildPageTree(state.pages),
    revisions: state.revisions
      .slice()
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
    syncStatus: state.syncStatus
  };
}

async function refreshWorkspace() {
  try {
    const workspaceResponse = await fetch(`${xgroupBaseURL}/api/workspace`);
    const workspacePayload = await workspaceResponse.json();
    state.snapshot.workspace = workspacePayload.snapshot;
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

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/docs") {
      authorize(state.snapshot.workspace, await resolveActingUserID(request), permissions.viewDocs);
      return json(response, 200, docsPayload());
    }

    if (request.method === "POST" && url.pathname === "/api/docs/refresh-workspace") {
      authorize(state.snapshot.workspace, await resolveActingUserID(request), permissions.editDocs);
      await refreshWorkspace();
      return json(response, 200, state.syncStatus);
    }

    if (request.method === "GET" && url.pathname.match(/^\/api\/pages\/[^/]+$/)) {
      authorize(state.snapshot.workspace, await resolveActingUserID(request), permissions.viewDocs);
      const pageID = url.pathname.split("/")[3];
      const page = state.pages.find((item) => item.id === pageID);
      if (!page) {
        return text(response, 404, `Unknown page: ${pageID}`);
      }
      return json(response, 200, {
        page,
        history: listPageRevisions(state, pageID)
      });
    }

    if (request.method === "GET" && url.pathname.match(/^\/api\/pages\/[^/]+\/history$/)) {
      authorize(state.snapshot.workspace, await resolveActingUserID(request), permissions.viewDocs);
      const pageID = url.pathname.split("/")[3];
      return json(response, 200, listPageRevisions(state, pageID));
    }

    if (request.method === "POST" && url.pathname === "/api/pages") {
      const actingUserID = await resolveActingUserID(request);
      authorize(state.snapshot.workspace, actingUserID, permissions.editDocs);
      const payload = await readBody(request);
      const page = createPage(state, payload, actingUserID);
      await persist();
      return json(response, 201, page);
    }

    if (request.method === "PATCH" && url.pathname.match(/^\/api\/pages\/[^/]+$/)) {
      const actingUserID = await resolveActingUserID(request);
      authorize(state.snapshot.workspace, actingUserID, permissions.editDocs);
      const pageID = url.pathname.split("/")[3];
      const payload = await readBody(request);
      const page = updatePage(state, pageID, payload, actingUserID);
      await persist();
      return json(response, 200, page);
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
  console.log(`xdoc-api listening on http://127.0.0.1:${port}`);
});
