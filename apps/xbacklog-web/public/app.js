const shellAPI = window.XHarborShell;

let selectedTaskID = null;
let draggedTaskID = null;
const boardFilters = {
  projectID: "all",
  teamID: "all",
  assigneeUserID: "all",
  query: ""
};

function readBacklogLocation() {
  const url = new URL(window.location.href);
  return {
    view: url.searchParams.get("view") || "",
    taskID: url.searchParams.get("taskId") || ""
  };
}

function syncBacklogLocation(view, taskID = "") {
  const url = new URL(window.location.href);
  if (view && view !== "board") {
    url.searchParams.set("view", view);
  } else {
    url.searchParams.delete("view");
  }
  if (taskID) {
    url.searchParams.set("taskId", taskID);
  } else {
    url.searchParams.delete("taskId");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

async function requestJSON(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) return null;
  return response.json();
}

async function fetchBacklog() {
  return requestJSON("/api/backlog", { headers: {} });
}

async function fetchTaskDetail(taskID) {
  return requestJSON(`/api/tasks/${taskID}`, { headers: {} });
}

async function loadSession() {
  return requestJSON("/api/session", { headers: {} });
}

async function loadUsers() {
  return requestJSON("/api/users", { headers: {} });
}

async function createSession(userID) {
  return requestJSON("/api/session", {
    method: "POST",
    body: JSON.stringify({ userID })
  });
}

async function destroySession() {
  return requestJSON("/api/session", {
    method: "DELETE"
  });
}

async function syncWorkspace() {
  return requestJSON("/api/sync-workspace", { method: "POST", body: JSON.stringify({}) });
}

function rowItem(title, subtitle, meta = "", options = {}) {
  return `
    <article class="row-item two-col">
      <div class="row-main">
        <span class="row-title">${options.titleHTML ? title : shellAPI.escapeHTML(title)}</span>
        <span class="row-subtitle">${options.subtitleHTML ? subtitle : shellAPI.escapeHTML(subtitle)}</span>
      </div>
      <div class="row-meta">${options.metaHTML ? meta : shellAPI.escapeHTML(meta)}</div>
    </article>
  `;
}

function userRef(user, fallback = "Unknown user") {
  if (!user) return shellAPI.escapeHTML(fallback);
  return `<span data-user-id="${shellAPI.escapeHTML(user.id)}">${shellAPI.escapeHTML(user.displayName)}</span>`;
}

function taskCard(task, projectName, assignee, active) {
  return `
    <article class="task-card${active ? " active" : ""}" data-task-id="${task.id}" draggable="true">
      <h4>${shellAPI.renderTagText(task.title)}</h4>
      <p>${shellAPI.escapeHTML(projectName)} · ${userRef(assignee, "Unassigned")}</p>
      <small>${shellAPI.escapeHTML(task.status)}</small>
    </article>
  `;
}

function statusLabel(status) {
  if (status === "new") return "New";
  if (status === "in_progress") return "In Progress";
  if (status === "done") return "Done";
  return status;
}

function filterTasks(tasks, projects) {
  return tasks.filter((task) => {
    const project = projects.find((item) => item.id === task.projectID);
    if (boardFilters.projectID !== "all" && task.projectID !== boardFilters.projectID) {
      return false;
    }
    if (boardFilters.teamID !== "all" && project?.teamID !== boardFilters.teamID) {
      return false;
    }
    if (boardFilters.assigneeUserID !== "all" && (task.assigneeUserID || "") !== boardFilters.assigneeUserID) {
      return false;
    }
    if (boardFilters.query.trim()) {
      const haystack = `${task.title} ${task.description || ""}`.toLowerCase();
      if (!haystack.includes(boardFilters.query.trim().toLowerCase())) {
        return false;
      }
    }
    return true;
  });
}

const shell = shellAPI.createShell({
  appName: "xBacklog",
  appSubtitle: "Projects and delivery workflow",
  shellClassName: "shell-platform",
  defaultView: "board",
  navigation: [
    {
      section: "Planning",
      items: [
        { id: "board", label: "Board", copy: "Compact task board with detail pane." },
        { id: "projects", label: "Projects", copy: "Project catalog and creation." },
        { id: "comments", label: "Comments", copy: "Recent workflow discussion." }
      ]
    },
    {
      section: "System",
      items: [
        { id: "settings", label: "Settings", copy: "Workspace preferences." }
      ]
    }
  ],
  loadUsers,
  loadSession,
  onLogin: createSession,
  onLogout: destroySession,
  renderView: async ({ setHeader, setMetrics, setPanels, renderEmpty, escapeHTML, formatDateTime, refresh, state }) => {
    const locationState = readBacklogLocation();
    if (["board", "projects", "comments"].includes(locationState.view) && locationState.view !== state.currentView) {
      state.currentView = locationState.view;
    }

    const payload = await fetchBacklog();
    const { workspace, projects, tasks, comments, syncStatus } = payload;
    const columns = [
      { id: "new", label: "New" },
      { id: "in_progress", label: "In Progress" },
      { id: "done", label: "Done" }
    ];

    selectedTaskID = tasks.some((task) => task.id === selectedTaskID) ? selectedTaskID : tasks[0]?.id ?? null;

    if (state.currentView === "projects") {
      setMetrics([]);
      setHeader("Projects", "Compact project catalog separated from task execution.", `${projects.length} projects`);
      const selectedProject = projects[0] ?? null;
      setPanels([
        {
          span: "span-5",
          title: "Create Project",
          copy: "Attach a new project to its owning team.",
          html: `
            <form id="project-form" class="compact-stack">
              <input id="project-name" class="shell-input" placeholder="Project name" required>
              <select id="project-team" class="shell-select">
                ${workspace.teams.map((team) => `<option value="${escapeHTML(team.id)}">${escapeHTML(team.name)}</option>`).join("")}
              </select>
              <button class="shell-button" type="submit">Create project</button>
            </form>
          `
        },
        {
          span: "span-3",
          title: "Edit Project",
          copy: "Rename the project or move it to another team.",
          html: selectedProject ? `
            <form id="project-edit-form" class="compact-stack">
              <select id="project-edit-id" class="shell-select">
                ${projects.map((project) => `<option value="${escapeHTML(project.id)}">${escapeHTML(project.name)}</option>`).join("")}
              </select>
              <input id="project-edit-name" class="shell-input" value="${escapeHTML(selectedProject.name)}" required>
              <select id="project-edit-team" class="shell-select">
                ${workspace.teams.map((team) => `<option value="${escapeHTML(team.id)}"${team.id === selectedProject.teamID ? " selected" : ""}>${escapeHTML(team.name)}</option>`).join("")}
              </select>
              <button class="shell-button-secondary" type="submit">Save project</button>
            </form>
          ` : renderEmpty("No projects", "Create a project first to edit it.")
        },
        {
          span: "span-4",
          title: "Project Catalog",
          copy: "Lean list view instead of large cards.",
          html: projects.length
            ? `<div class="row-list">${projects.map((project) => {
                const team = workspace.teams.find((item) => item.id === project.teamID);
                const projectTasks = tasks.filter((task) => task.projectID === project.id).length;
                return rowItem(project.name, team?.name || project.teamID, `${projectTasks} tasks`);
              }).join("")}</div>`
            : renderEmpty("No projects", "Create the first project to begin planning.")
        }
      ]);

      document.getElementById("project-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await requestJSON("/api/projects", {
          method: "POST",
          body: JSON.stringify({
            name: document.getElementById("project-name").value,
            teamID: document.getElementById("project-team").value
          })
        });
        await refresh();
      });

      document.getElementById("project-edit-id")?.addEventListener("change", (event) => {
        const project = projects.find((item) => item.id === event.target.value);
        if (!project) return;
        document.getElementById("project-edit-name").value = project.name;
        document.getElementById("project-edit-team").value = project.teamID;
      });

      document.getElementById("project-edit-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await requestJSON(`/api/projects/${document.getElementById("project-edit-id").value}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: document.getElementById("project-edit-name").value,
            teamID: document.getElementById("project-edit-team").value
          })
        });
        await refresh();
      });
      return;
    }

    if (state.currentView === "comments") {
      setMetrics([]);
      setHeader("Comments", "Workflow discussion in a compact chronological list.", `${comments.length} comments`);
      setPanels([
        {
          span: "span-12",
          title: "Recent Comments",
          copy: "Comments are attached to tasks and rendered in the selected timezone.",
          html: comments.length
            ? `<div class="row-list">${comments.slice().reverse().map((comment) => {
                const author = workspace.users.find((item) => item.id === comment.authorUserID);
                const task = tasks.find((item) => item.id === comment.taskID);
                return rowItem(
                  `${author ? userRef(author) : escapeHTML(comment.authorUserID)} on ${escapeHTML(task?.title || comment.taskID)}`,
                  shellAPI.renderTagText(comment.body),
                  formatDateTime(comment.createdAt),
                  { titleHTML: true, subtitleHTML: true }
                );
              }).join("")}</div>`
            : renderEmpty("No comments", "Discussion appears here once tasks are being updated.")
        }
      ]);
      return;
    }

    const filteredTasks = filterTasks(tasks, projects);
    if (locationState.taskID && filteredTasks.some((task) => task.id === locationState.taskID)) {
      selectedTaskID = locationState.taskID;
    }
    selectedTaskID = filteredTasks.some((task) => task.id === selectedTaskID) ? selectedTaskID : filteredTasks[0]?.id ?? null;
    const detail = selectedTaskID ? await fetchTaskDetail(selectedTaskID) : null;
    syncBacklogLocation(state.currentView, selectedTaskID);

    setMetrics([
      { label: "New", value: filteredTasks.filter((task) => task.status === "new").length, meta: "Fresh work" },
      { label: "In Progress", value: filteredTasks.filter((task) => task.status === "in_progress").length, meta: "Active execution" },
      { label: "Done", value: filteredTasks.filter((task) => task.status === "done").length, meta: "Completed work" }
    ]);
    setHeader("Task Board", "Compact kanban board with task detail and full change history.", syncStatus.lastSyncSucceeded ? "Synced" : "Sync pending");
    setPanels([
      {
        span: "span-8",
        title: "Board",
        copy: "Drag tasks between columns or open one to inspect full detail.",
        html: `
          <div class="section-toolbar">
            <span class="muted">${escapeHTML(syncStatus.lastSyncAt ? `Last sync ${formatDateTime(syncStatus.lastSyncAt)}` : "No sync yet")}</span>
            <button id="sync-button" class="shell-button-secondary" type="button">Sync from xGroup</button>
          </div>
          <div class="compact-stack">
            <div class="row-item single">
              <div class="compact-stack">
                <select id="filter-project" class="shell-select">
                  <option value="all">All projects</option>
                  ${projects.map((project) => `<option value="${escapeHTML(project.id)}"${project.id === boardFilters.projectID ? " selected" : ""}>${escapeHTML(project.name)}</option>`).join("")}
                </select>
                <select id="filter-team" class="shell-select">
                  <option value="all">All teams</option>
                  ${workspace.teams.map((team) => `<option value="${escapeHTML(team.id)}"${team.id === boardFilters.teamID ? " selected" : ""}>${escapeHTML(team.name)}</option>`).join("")}
                </select>
                <select id="filter-assignee" class="shell-select">
                  <option value="all">All assignees</option>
                  <option value="">Unassigned</option>
                  ${workspace.users.map((user) => `<option value="${escapeHTML(user.id)}"${user.id === boardFilters.assigneeUserID ? " selected" : ""}>${escapeHTML(user.displayName)}</option>`).join("")}
                </select>
                <input id="filter-query" class="shell-input" placeholder="Search task title or description" value="${escapeHTML(boardFilters.query)}">
              </div>
            </div>
          </div>
          <div class="board-columns">
            ${columns.map((column) => {
              const columnTasks = filteredTasks.filter((task) => task.status === column.id);
              return `
                <section class="board-column" data-status="${column.id}">
                  <header><h3>${escapeHTML(column.label)}</h3><span>${columnTasks.length}</span></header>
                  <div class="task-stack">
                    ${columnTasks.length
                      ? columnTasks.map((task) => {
                          const project = projects.find((item) => item.id === task.projectID);
                          const assignee = workspace.users.find((item) => item.id === task.assigneeUserID);
                          return taskCard(task, project?.name || task.projectID, assignee, task.id === selectedTaskID);
                        }).join("")
                      : renderEmpty("No tasks", `Drop a task into ${column.label}.`)}
                  </div>
                </section>
              `;
            }).join("")}
          </div>
        `
      },
      {
        span: "span-4",
        title: detail ? detail.task.title : "Task Detail",
        copy: detail ? "Inspect the task, update metadata, and review history." : "Select a task to inspect it.",
        html: detail ? `
          <div class="detail-grid">
            <form id="task-detail-form" class="compact-stack">
              <input id="detail-title" class="shell-input" value="${escapeHTML(detail.task.title)}" required>
              <textarea id="detail-description" class="shell-textarea" placeholder="Description">${escapeHTML(detail.task.description || "")}</textarea>
              <select id="detail-assignee" class="shell-select">
                <option value="">Unassigned</option>
                ${workspace.users.map((user) => `<option value="${escapeHTML(user.id)}"${user.id === detail.task.assigneeUserID ? " selected" : ""}>${escapeHTML(user.displayName)}</option>`).join("")}
              </select>
              <button class="shell-button" type="submit">Save task</button>
            </form>

            <div class="detail-block">
              <h4>Status</h4>
              <p>${escapeHTML(statusLabel(detail.task.status))}</p>
            </div>
            <div class="detail-block">
              <h4>Created</h4>
              <p>${escapeHTML(formatDateTime(detail.task.createdAt))}</p>
            </div>
            <div class="detail-block">
              <h4>Updated</h4>
              <p>${escapeHTML(formatDateTime(detail.task.updatedAt))}</p>
            </div>
            <div class="detail-block">
              <h4>Completed</h4>
              <p>${escapeHTML(detail.task.completedAt ? formatDateTime(detail.task.completedAt) : "Not completed")}</p>
            </div>
            <div class="detail-block">
              <h4>History</h4>
              <div class="row-list">
                ${detail.history.length
                  ? detail.history.map((event) => rowItem(event.type, event.detail, formatDateTime(event.createdAt))).join("")
                  : renderEmpty("No history", "Task changes will appear here.")}
              </div>
            </div>
            <div class="detail-block">
              <h4>Comments</h4>
              <div class="row-list">
                ${detail.comments.length
                  ? detail.comments.map((comment) => {
                      const author = workspace.users.find((user) => user.id === comment.authorUserID);
                      return rowItem(author ? userRef(author) : escapeHTML(comment.authorUserID), shellAPI.renderTagText(comment.body), formatDateTime(comment.createdAt), { titleHTML: true, subtitleHTML: true });
                    }).join("")
                  : renderEmpty("No comments", "Add the first task comment below.")}
              </div>
            </div>
            <div class="detail-block">
              <h4>Description</h4>
              <div class="row-list">
                ${detail.task.description
                  ? rowItem("Task body", shellAPI.renderTagText(detail.task.description), "", { subtitleHTML: true })
                  : renderEmpty("No description", "Add a description to capture context and tags.")}
              </div>
            </div>
            <form id="comment-form" class="compact-stack">
              <textarea id="comment-body" class="shell-textarea" placeholder="Comment" required></textarea>
              <button class="shell-button-secondary" type="submit">Add comment</button>
            </form>
          </div>
        ` : renderEmpty("No task selected", "Pick a task from the board.")
      }
      ,
      {
        span: "span-12",
        title: "Create Task",
        copy: "Create new work with description, assignee, and project assignment directly from the board view.",
        html: `
          <form id="task-create-form" class="compact-stack">
            <input id="task-title" class="shell-input" placeholder="Task title" required>
            <textarea id="task-description" class="shell-textarea" placeholder="Description"></textarea>
            <select id="task-project" class="shell-select">
              ${projects.map((project) => `<option value="${escapeHTML(project.id)}">${escapeHTML(project.name)}</option>`).join("")}
            </select>
            <select id="task-assignee" class="shell-select">
              <option value="">Unassigned</option>
              ${workspace.users.map((user) => `<option value="${escapeHTML(user.id)}">${escapeHTML(user.displayName)}</option>`).join("")}
            </select>
            <button class="shell-button" type="submit">Create task</button>
          </form>
        `
      }
    ]);

    document.getElementById("sync-button")?.addEventListener("click", async () => {
      await syncWorkspace();
      await refresh();
    });

    document.getElementById("filter-project")?.addEventListener("change", async (event) => {
      boardFilters.projectID = event.target.value;
      await refresh();
    });
    document.getElementById("filter-team")?.addEventListener("change", async (event) => {
      boardFilters.teamID = event.target.value;
      await refresh();
    });
    document.getElementById("filter-assignee")?.addEventListener("change", async (event) => {
      boardFilters.assigneeUserID = event.target.value;
      await refresh();
    });
    document.getElementById("filter-query")?.addEventListener("input", async (event) => {
      boardFilters.query = event.target.value;
      await refresh();
    });

    document.getElementById("task-create-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await requestJSON("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: document.getElementById("task-title").value,
          description: document.getElementById("task-description").value,
          projectID: document.getElementById("task-project").value,
          assigneeUserID: document.getElementById("task-assignee").value || null
        })
      });
      await refresh();
    });

    document.querySelectorAll(".task-card").forEach((cardNode) => {
      cardNode.addEventListener("click", async () => {
        selectedTaskID = cardNode.dataset.taskId;
        await refresh();
      });
      cardNode.addEventListener("dragstart", () => {
        draggedTaskID = cardNode.dataset.taskId;
      });
      cardNode.addEventListener("dragend", () => {
        draggedTaskID = null;
        document.querySelectorAll(".board-column").forEach((column) => column.classList.remove("drop-target"));
      });
    });

    document.querySelectorAll(".board-column").forEach((column) => {
      column.addEventListener("dragover", (event) => {
        event.preventDefault();
        column.classList.add("drop-target");
      });
      column.addEventListener("dragleave", () => {
        column.classList.remove("drop-target");
      });
      column.addEventListener("drop", async (event) => {
        event.preventDefault();
        column.classList.remove("drop-target");
        if (!draggedTaskID) return;
        await requestJSON(`/api/tasks/${draggedTaskID}/status`, {
          method: "POST",
          body: JSON.stringify({ status: column.dataset.status })
        });
        selectedTaskID = draggedTaskID;
        draggedTaskID = null;
        await refresh();
      });
    });

    document.getElementById("task-detail-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await requestJSON(`/api/tasks/${selectedTaskID}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: document.getElementById("detail-title").value,
          description: document.getElementById("detail-description").value,
          assigneeUserID: document.getElementById("detail-assignee").value || null
        })
      });
      await refresh();
    });

    document.getElementById("comment-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await requestJSON(`/api/tasks/${selectedTaskID}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: document.getElementById("comment-body").value })
      });
      await refresh();
    });

    ["task-title", "task-description", "detail-title", "detail-description", "comment-body"]
      .forEach((id) => shellAPI.attachTagAutocomplete(document.getElementById(id)));
  }
});

shell.refresh().catch((error) => {
  document.getElementById("app").innerHTML = `<pre>${shellAPI.escapeHTML(error.message)}</pre>`;
});
