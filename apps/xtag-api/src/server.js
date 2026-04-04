import http from "node:http";
import { createDemoTagState, createDemoWorkspace, normalizeTag } from "@xharbor/contracts";
import { AuthorizationError, authorize, permissions } from "@xharbor/platform-auth";
import { SessionStore, parseCookies, sessionCookieName } from "@xharbor/platform-session";
import { SqliteStateStore } from "@xharbor/sqlite-store";
import { buildTagIndex, groupItemsBySource, queryTagIndex } from "./tags.js";

const port = 8085;
const xgroupBaseURL = "http://127.0.0.1:8080";
const AUTO_REINDEX_TTL_MS = 15_000;
const sources = [
  { id: "xbacklog", baseURL: "http://127.0.0.1:8081" },
  { id: "xtalk", baseURL: "http://127.0.0.1:8083" },
  { id: "xdoc", baseURL: "http://127.0.0.1:8084" }
];

const stateStore = new SqliteStateStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname, "xtag");
const sessionStore = new SessionStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname);
let state = await stateStore.loadOr({
  workspace: createDemoWorkspace().snapshot,
  ...createDemoTagState()
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

async function persist() {
  await stateStore.save(state);
}

async function refreshWorkspace() {
  const response = await fetch(`${xgroupBaseURL}/api/workspace`);
  const payload = await response.json();
  state.workspace = payload.snapshot;
}

async function fetchSourceCatalog(source, actingUserID) {
  const response = await fetch(`${source.baseURL}/api/tags/catalog`, {
    headers: {
      "x-user-id": actingUserID
    }
  });

  if (!response.ok) {
    throw new Error(`${source.id} responded with ${response.status}`);
  }

  return response.json();
}

async function refreshIndex(actingUserID) {
  try {
    await refreshWorkspace();
    const payloads = await Promise.all(sources.map((source) => fetchSourceCatalog(source, actingUserID)));
    const index = buildTagIndex(payloads, state.aliases || {});
    const refreshedAt = new Date().toISOString();
    state.index = {
      ...index,
      sources: sources.map((source) => ({
        id: source.id,
        itemCount: payloads.find((payload) => payload.source === source.id)?.items?.length || 0
      })),
      refreshedAt
    };
    state.syncStatus = {
      sources: Object.fromEntries(sources.map((source) => [source.id, source.baseURL])),
      lastSyncAt: refreshedAt,
      lastSyncSucceeded: true,
      lastError: null
    };
    await persist();
  } catch (error) {
    state.syncStatus = {
      sources: Object.fromEntries(sources.map((source) => [source.id, source.baseURL])),
      lastSyncAt: new Date().toISOString(),
      lastSyncSucceeded: false,
      lastError: String(error.message || error)
    };
    await persist();
    throw error;
  }
}

function buildResponse(query) {
  const result = queryTagIndex(state.index, query, state.aliases || {});
  return {
    query: result.query,
    tags: result.tags,
    items: result.items,
    groupedItems: groupItemsBySource(result.items),
    index: {
      refreshedAt: state.index.refreshedAt,
      sourceCount: state.index.sources?.length || 0,
      tagCount: state.index.tags.length,
      itemCount: state.index.items.length,
      sources: state.index.sources || []
    },
    aliases: Object.entries(state.aliases || {})
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([tag, canonicalTag]) => ({ tag, canonicalTag })),
    syncStatus: state.syncStatus
  };
}

function indexIsStale() {
  if (!state.index.tags.length) return true;
  if (!state.syncStatus?.lastSyncAt) return true;
  const lastSync = new Date(state.syncStatus.lastSyncAt).getTime();
  if (Number.isNaN(lastSync)) return true;
  return Date.now() - lastSync > AUTO_REINDEX_TTL_MS;
}

function indexHasTag(tag) {
  const normalized = normalizeTag(tag);
  return state.index.tags.some((item) => item.tag === normalized);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const actingUserID = await resolveActingUserID(request);

    if (request.method === "GET" && url.pathname === "/api/tags") {
      authorize(state.workspace, actingUserID, permissions.viewTags);
      const query = normalizeTag(url.searchParams.get("query") || "");
      if (indexIsStale() || (query && !indexHasTag(query))) {
        await refreshIndex(actingUserID);
      }
      return json(response, 200, buildResponse(query));
    }

    if (request.method === "GET" && url.pathname.match(/^\/api\/tags\/[^/]+$/)) {
      authorize(state.workspace, actingUserID, permissions.viewTags);
      const tag = normalizeTag(url.pathname.split("/")[3]);
      if (indexIsStale() || (tag && !indexHasTag(tag))) {
        await refreshIndex(actingUserID);
      }
      return json(response, 200, buildResponse(tag));
    }

    if (request.method === "POST" && url.pathname === "/api/tags/reindex") {
      authorize(state.workspace, actingUserID, permissions.manageTags);
      await refreshIndex(actingUserID);
      return json(response, 200, buildResponse(""));
    }

    if (request.method === "POST" && url.pathname === "/api/tags/aliases") {
      authorize(state.workspace, actingUserID, permissions.manageTags);
      const body = await new Promise((resolve, reject) => {
        let raw = "";
        request.on("data", (chunk) => { raw += chunk; });
        request.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
        request.on("error", reject);
      });

      const tag = normalizeTag(body.tag);
      const canonicalTag = normalizeTag(body.canonicalTag);
      if (!tag || !canonicalTag || tag === canonicalTag) {
        throw new Error("Alias requires distinct tag and canonicalTag values.");
      }

      state.aliases = {
        ...(state.aliases || {}),
        [tag]: canonicalTag
      };
      await refreshIndex(actingUserID);
      return json(response, 200, buildResponse(""));
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/api\/tags\/aliases\/[^/]+$/)) {
      authorize(state.workspace, actingUserID, permissions.manageTags);
      const tag = normalizeTag(url.pathname.split("/")[4]);
      if (tag && state.aliases?.[tag]) {
        delete state.aliases[tag];
        await refreshIndex(actingUserID);
      }
      return json(response, 200, buildResponse(""));
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
  console.log(`xtag-api listening on http://127.0.0.1:${port}`);
});
