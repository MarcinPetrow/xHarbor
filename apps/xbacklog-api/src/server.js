import http from "node:http";
import { createDemoBacklogState, createDemoWorkspace, slugify } from "@xharbor/contracts";
import { AuthorizationError, authorize, permissions } from "@xharbor/platform-auth";
import { SessionStore, parseCookies, sessionCookieName } from "@xharbor/platform-session";
import { SqliteStateStore } from "@xharbor/sqlite-store";
import {
  assertKnownTaskStatus,
  nextCommentID,
  recordTaskCommented,
  recordTaskCreated,
  recordTaskUpdated,
  transitionTask
} from "./workflow.js";

const port = 8081;
const xgroupBaseURL = "http://127.0.0.1:8080";
const stateStore = new SqliteStateStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname, "xbacklog");
const sessionStore = new SessionStore(new URL("../../../data/sqlite/xharbor.db", import.meta.url).pathname);
let state = await stateStore.loadOr(createDemoBacklogState(createDemoWorkspace().snapshot));
state.board.taskEvents ||= [];

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

async function syncWorkspace() {
  try {
    const response = await fetch(`${xgroupBaseURL}/api/workspace`);
    const payload = await response.json();
    state.board.workspace = payload.snapshot;
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

function findTask(taskID) {
  return state.board.tasks.find((item) => item.id === taskID) ?? null;
}

function findProject(projectID) {
  return state.board.projects.find((item) => item.id === projectID) ?? null;
}

function buildTaskDetail(taskID) {
  const task = findTask(taskID);
  if (!task) return null;
  return {
    task,
    project: findProject(task.projectID),
    comments: state.board.comments
      .filter((comment) => comment.taskID === taskID)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    history: state.board.taskEvents
      .filter((event) => event.taskID === taskID)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  };
}

function taskSummaryPayload() {
  return {
    workspace: state.board.workspace,
    projects: state.board.projects,
    tasks: state.board.tasks,
    comments: state.board.comments,
    taskEvents: state.board.taskEvents,
    syncStatus: state.syncStatus
  };
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/backlog") {
      return json(response, 200, taskSummaryPayload());
    }

    if (request.method === "GET" && url.pathname.match(/^\/api\/tasks\/[^/]+$/)) {
      const taskID = url.pathname.split("/")[3];
      const detail = buildTaskDetail(taskID);
      if (!detail) {
        return text(response, 404, `Unknown task: ${taskID}`);
      }
      return json(response, 200, detail);
    }

    if (request.method === "POST" && url.pathname === "/api/sync-workspace") {
      authorize(state.board.workspace, await resolveActingUserID(request), permissions.manageBacklog);
      await syncWorkspace();
      return json(response, 200, state.syncStatus);
    }

    if (request.method === "POST" && url.pathname === "/api/projects") {
      await syncWorkspace();
      const payload = await readBody(request);
      authorize(state.board.workspace, await resolveActingUserID(request), permissions.createProject(payload.teamID));
      if (!state.board.workspace.teams.some((item) => item.id === payload.teamID)) {
        return text(response, 400, `Unknown team: ${payload.teamID}`);
      }
      const project = {
        id: `proj-${slugify(payload.name)}`,
        teamID: payload.teamID,
        name: payload.name
      };
      state.board.projects.push(project);
      await persist();
      return json(response, 201, project);
    }

    if (request.method === "POST" && url.pathname === "/api/tasks") {
      await syncWorkspace();
      const payload = await readBody(request);
      const project = findProject(payload.projectID);
      if (!project) {
        return text(response, 400, `Unknown project: ${payload.projectID}`);
      }
      const actingUserID = await resolveActingUserID(request);
      authorize(state.board.workspace, actingUserID, permissions.createTask(project.teamID));
      if (payload.assigneeUserID && !state.board.workspace.users.some((item) => item.id === payload.assigneeUserID)) {
        return text(response, 400, `Unknown user: ${payload.assigneeUserID}`);
      }
      const now = new Date().toISOString();
      const task = {
        id: `task-${slugify(payload.title)}`,
        projectID: payload.projectID,
        title: payload.title,
        description: payload.description ?? "",
        assigneeUserID: payload.assigneeUserID ?? null,
        status: "new",
        createdAt: now,
        updatedAt: now,
        completedAt: null
      };
      state.board.tasks.push(task);
      recordTaskCreated(task, actingUserID, state.board.taskEvents);
      await persist();
      return json(response, 201, task);
    }

    if (request.method === "PATCH" && url.pathname.match(/^\/api\/projects\/[^/]+$/)) {
      await syncWorkspace();
      const projectID = url.pathname.split("/")[3];
      const project = findProject(projectID);
      if (!project) {
        return text(response, 404, `Unknown project: ${projectID}`);
      }
      const actingUserID = await resolveActingUserID(request);
      authorize(state.board.workspace, actingUserID, permissions.createProject(project.teamID));
      const payload = await readBody(request);
      if (payload.teamID && !state.board.workspace.teams.some((item) => item.id === payload.teamID)) {
        return text(response, 400, `Unknown team: ${payload.teamID}`);
      }
      if (typeof payload.name === "string" && payload.name) {
        project.name = payload.name;
      }
      if (typeof payload.teamID === "string" && payload.teamID) {
        project.teamID = payload.teamID;
      }
      await persist();
      return json(response, 200, project);
    }

    if (request.method === "PATCH" && url.pathname.match(/^\/api\/tasks\/[^/]+$/)) {
      await syncWorkspace();
      const taskID = url.pathname.split("/")[3];
      const task = findTask(taskID);
      if (!task) {
        return text(response, 404, `Unknown task: ${taskID}`);
      }
      const project = findProject(task.projectID);
      const actingUserID = await resolveActingUserID(request);
      authorize(state.board.workspace, actingUserID, permissions.createTask(project.teamID));
      const payload = await readBody(request);
      const changes = [];

      if (typeof payload.title === "string" && payload.title !== task.title) {
        changes.push(`Title changed from "${task.title}" to "${payload.title}".`);
        task.title = payload.title;
      }

      if (typeof payload.description === "string" && payload.description !== task.description) {
        changes.push("Description updated.");
        task.description = payload.description;
      }

      if (payload.assigneeUserID !== undefined && payload.assigneeUserID !== task.assigneeUserID) {
        if (payload.assigneeUserID && !state.board.workspace.users.some((item) => item.id === payload.assigneeUserID)) {
          return text(response, 400, `Unknown user: ${payload.assigneeUserID}`);
        }
        const previousAssignee = task.assigneeUserID ?? "Unassigned";
        const nextAssignee = payload.assigneeUserID ?? "Unassigned";
        changes.push(`Assignee changed from ${previousAssignee} to ${nextAssignee}.`);
        task.assigneeUserID = payload.assigneeUserID ?? null;
      }

      if (payload.status && payload.status !== task.status) {
        transitionTask(task, payload.status, actingUserID, state.board.taskEvents);
      }

      if (changes.length) {
        task.updatedAt = new Date().toISOString();
        recordTaskUpdated(task, actingUserID, state.board.taskEvents, changes.join(" "));
      }

      await persist();
      return json(response, 200, task);
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/tasks\/[^/]+\/status$/)) {
      await syncWorkspace();
      const taskID = url.pathname.split("/")[3];
      const task = findTask(taskID);
      if (!task) {
        return text(response, 404, `Unknown task: ${taskID}`);
      }
      const project = findProject(task.projectID);
      const actingUserID = await resolveActingUserID(request);
      authorize(state.board.workspace, actingUserID, permissions.createTask(project.teamID));
      const payload = await readBody(request);
      assertKnownTaskStatus(payload.status);
      transitionTask(task, payload.status, actingUserID, state.board.taskEvents);
      await persist();
      return json(response, 200, task);
    }

    if (request.method === "POST" && url.pathname.match(/^\/api\/tasks\/[^/]+\/comments$/)) {
      await syncWorkspace();
      const taskID = url.pathname.split("/")[3];
      const task = findTask(taskID);
      if (!task) {
        return text(response, 404, `Unknown task: ${taskID}`);
      }
      const project = findProject(task.projectID);
      const actingUserID = await resolveActingUserID(request);
      authorize(state.board.workspace, actingUserID, permissions.createTask(project.teamID));
      const payload = await readBody(request);
      const createdAt = new Date().toISOString();
      const comment = {
        id: nextCommentID(taskID, state.board.comments),
        taskID,
        authorUserID: actingUserID,
        body: payload.body,
        createdAt
      };
      state.board.comments.push(comment);
      task.updatedAt = createdAt;
      recordTaskCommented(taskID, actingUserID, createdAt, state.board.taskEvents);
      await persist();
      return json(response, 201, comment);
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
  console.log(`xbacklog-api listening on http://127.0.0.1:${port}`);
});
