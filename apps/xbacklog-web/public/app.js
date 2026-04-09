const shellAPI = window.XHarborShell;
const requestJSON = shellAPI.requestJSON;
const actionButton = shellAPI.actionButton;
const sectionToolbar = shellAPI.sectionToolbar;
const rowItem = shellAPI.rowItem;
const crudListPanel = shellAPI.crudListPanel;
const crudFormPanel = shellAPI.crudFormPanel;
const crudSidePanel = shellAPI.crudSidePanel;
const confirmDestructive = shellAPI.confirmDestructive;
const bindActions = shellAPI.bindActions;
const bindFormSubmit = shellAPI.bindFormSubmit;
const bindControlInputs = shellAPI.bindControlInputs;
const createStateRefresher = shellAPI.createStateRefresher;
const bindDragDrop = shellAPI.bindDragDrop;

let selectedTaskID = null;
const boardFilters = {
  teamID: "all",
  assigneeUserID: "all",
  query: ""
};
const backlogRouter = shellAPI.createQueryRouter({
  defaults: { view: "board", taskId: "", projectId: "" },
  read: (location) => ({
    view: location.view,
    taskID: location.taskId,
    projectID: location.projectId
  }),
  write: ({ view = "board", taskID = "", projectID = "" }) => ({
    view,
    taskId: taskID,
    projectId: projectID
  })
});

async function fetchBacklog() {
  return requestJSON("/api/backlog", { headers: {} });
}

async function fetchTaskDetail(taskID) {
  return requestJSON(`/api/tasks/${taskID}`, { headers: {} });
}

async function syncWorkspace() {
  return requestJSON("/api/sync-workspace", { method: "POST", body: JSON.stringify({}) });
}

function userRef(user, fallback = "Unknown user") {
  return shellAPI.renderUserRef(user, fallback);
}

function issueKey(task) {
  return String(task.key || task.id || "").toUpperCase();
}

function taskCard(task, projectName, assignee, active) {
  return `
    <article class="task-card${active ? " active" : ""}" data-action="select-task-card" data-task-id="${task.id}" draggable="true">
      <h4>
        <button class="task-key-link" type="button" data-action="open-task-edit" data-task-id="${shellAPI.escapeHTML(task.id)}">${shellAPI.escapeHTML(issueKey(task))}</button>
        <span>${shellAPI.renderTagText(task.title)}</span>
      </h4>
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

function filterTasks(tasks, projects, selectedProjectID) {
  return tasks.filter((task) => {
    const project = projects.find((item) => item.id === task.projectID);
    if (selectedProjectID && task.projectID !== selectedProjectID) {
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

function backlogReturnView(state) {
  return state.backlogReturnView === "items" ? "items" : "board";
}

function backlogReturnLabel(state) {
  return backlogReturnView(state) === "items" ? "Back to items" : "Back to board";
}

function renderBacklogControls({ workspace, syncStatus, escapeHTML, formatDateTime, includeSync = false }) {
  return `
    <div class="backlog-inline-toolbar">
      <div class="backlog-inline-filters">
        <select id="filter-team" class="shell-select" aria-label="Filter by team">
          <option value="all">All teams</option>
          ${workspace.teams.map((team) => `<option value="${escapeHTML(team.id)}"${team.id === boardFilters.teamID ? " selected" : ""}>${escapeHTML(team.name)}</option>`).join("")}
        </select>
        <select id="filter-assignee" class="shell-select" aria-label="Filter by assignee">
          <option value="all">All assignees</option>
          <option value="">Unassigned</option>
          ${workspace.users.map((user) => `<option value="${escapeHTML(user.id)}"${user.id === boardFilters.assigneeUserID ? " selected" : ""}>${escapeHTML(user.displayName)}</option>`).join("")}
        </select>
        <input id="filter-query" class="shell-input" placeholder="Search task title or description" value="${escapeHTML(boardFilters.query)}" aria-label="Search tasks">
      </div>
      <div class="backlog-inline-actions">
        <button class="shell-button" type="button" data-action="open-task-create">Create task</button>
        <button class="shell-button-secondary" type="button" data-action="open-projects">Manage projects</button>
        ${includeSync ? '<button class="shell-button-secondary" type="button" data-action="sync-workspace">Sync from xGroup</button>' : ""}
      </div>
      <p class="dense-sub">${escapeHTML(syncStatus.lastSyncAt ? `Last sync ${formatDateTime(syncStatus.lastSyncAt)}` : "No sync yet")}</p>
    </div>
  `;
}

const shell = shellAPI.createShell({
  appName: "xBacklog",
  appSubtitle: "Projects and delivery workflow",
  shellClassName: "shell-group",
  defaultView: "board",
  navigation: [
    {
      section: "Planning",
      items: [
        { id: "board", label: "Board", copy: "Per-project task board with inline detail." },
        { id: "items", label: "Items", copy: "List and filter backlog items in one project." }
      ]
    },
    {
      section: "System",
      items: [
        { id: "settings", label: "Settings", copy: "Workspace preferences." }
      ]
    }
  ],
  loadUsers: shellAPI.loadUsers,
  loadSession: shellAPI.loadSession,
  onLogin: shellAPI.createSession,
  onLogout: shellAPI.destroySession,
  renderView: async ({ setHeader, setMetrics, setPanels, renderEmpty, escapeHTML, formatDateTime, refresh, state }) => {
    const routeAwareViews = ["board", "items", "projects", "task-create", "task-edit", "project-create", "project-edit"];
    if (routeAwareViews.includes(state.currentView)) {
      backlogRouter.sync({
        view: state.currentView,
        taskID: selectedTaskID,
        projectID: backlogRouter.read().projectID
      });
    }
    const locationState = backlogRouter.read();
    if (locationState.view === "comments") {
      backlogRouter.sync({ view: "board", taskID: locationState.taskID, projectID: locationState.projectID });
    }
    if (routeAwareViews.includes(locationState.view) && locationState.view !== state.currentView) {
      state.currentView = locationState.view;
    }

    const payload = await fetchBacklog();
    const { workspace, projects, tasks, comments, syncStatus } = payload;
    state.backlogReturnView ??= "board";
    const refreshBacklogState = createStateRefresher({
      refresh,
      sync: () => backlogRouter.sync({
        view: state.currentView,
        taskID: selectedTaskID,
        projectID: selectedProjectID
      })
    });
    const columns = [
      { id: "new", label: "New" },
      { id: "in_progress", label: "In Progress" },
      { id: "done", label: "Done" }
    ];

    let selectedProjectID = projects.some((project) => project.id === locationState.projectID)
      ? locationState.projectID
      : projects[0]?.id ?? "";
    const selectedTaskFromLocation = tasks.some((task) => task.id === locationState.taskID)
      ? locationState.taskID
      : tasks[0]?.id ?? "";
    selectedTaskID = tasks.some((task) => task.id === selectedTaskID) ? selectedTaskID : selectedTaskFromLocation || null;
    const syncBacklogRoute = () => backlogRouter.sync({
      view: state.currentView,
      taskID: selectedTaskID,
      projectID: selectedProjectID
    });
    const mountProjectPicker = () => {
      const nav = document.querySelector("#shell-nav");
      if (!nav) return;
      nav.querySelector(".backlog-nav-project")?.remove();
      if (!["board", "items", "task-create", "task-edit"].includes(state.currentView)) return;
      nav.insertAdjacentHTML("afterbegin", `
        <div class="backlog-nav-project">
          <select id="backlog-nav-project" class="shell-select" aria-label="Select project">
            ${projects.map((project) => `<option value="${escapeHTML(project.id)}"${project.id === selectedProjectID ? " selected" : ""}>${escapeHTML(project.name)}</option>`).join("")}
          </select>
        </div>
      `);
      document.getElementById("backlog-nav-project")?.addEventListener("change", async (event) => {
        await refreshBacklogState(() => {
          selectedProjectID = event.target.value;
          selectedTaskID = null;
        });
      });
    };

    if (state.currentView === "project-create") {
      setMetrics([]);
      setHeader("Create Project", "Create a project from a dedicated screen instead of mixing forms into the catalog.", `${projects.length} projects`);
      setPanels([
        crudFormPanel({
          span: "span-8",
          title: "Create Project",
          copy: "Attach a new project to its owning team.",
          toolbarTitle: "Project details",
          backAction: 'data-action="open-projects"',
          backLabel: "Back to projects",
          content: `
            <form id="project-form" class="compact-stack">
              <input id="project-name" name="name" class="shell-input" placeholder="Project name" required>
              <select id="project-team" name="teamID" class="shell-select">
                ${workspace.teams.map((team) => `<option value="${escapeHTML(team.id)}">${escapeHTML(team.name)}</option>`).join("")}
              </select>
              <button class="shell-button" type="submit">Create project</button>
            </form>
          `
        }),
        crudSidePanel({
          span: "span-4",
          title: "Project Catalog",
          copy: "Return to the catalog to edit or delete projects.",
          toolbarTitle: "Projects",
          backAction: 'data-action="open-projects"',
          backLabel: "Back to projects",
          content: projects.length
            ? `<div class="row-list">${projects.slice(0, 8).map((project) => {
                const team = workspace.teams.find((item) => item.id === project.teamID);
                const projectTasks = tasks.filter((task) => task.projectID === project.id).length;
                return rowItem(project.name, team?.name || project.teamID, `${projectTasks} tasks`);
              }).join("")}</div>`
            : renderEmpty("No projects", "Create the first project to begin planning.")
        })
      ]);

      bindFormSubmit("#view-content", "#project-form", async (formData) => {
        await requestJSON("/api/projects", {
          method: "POST",
          body: JSON.stringify({
            name: formData.get("name"),
            teamID: formData.get("teamID")
          })
        });
        await refreshBacklogState(() => {
          state.currentView = "projects";
        });
      }, "xbacklog-project-create-submit");
      bindActions("#view-content", {
        "open-projects": async () => {
          await refreshBacklogState(() => {
            state.currentView = "projects";
          });
        }
      }, "xbacklog-project-create");
      syncBacklogRoute();
      return;
    }

    if (state.currentView === "project-edit") {
      const selectedProject = projects.find((project) => project.id === selectedProjectID) || null;
      setMetrics([]);
      setHeader("Edit Project", "Update one project at a time from a dedicated edit screen.", selectedProject ? selectedProject.name : "Unknown project");
      setPanels([
        crudFormPanel({
          span: "span-8",
          title: "Edit Project",
          copy: "Rename the project or move it to another team.",
          toolbarTitle: selectedProject?.name || "Project details",
          backAction: 'data-action="open-projects"',
          backLabel: "Back to projects",
          content: selectedProject ? `
            <form id="project-edit-form" class="compact-stack">
              <input id="project-edit-name" name="name" class="shell-input" value="${escapeHTML(selectedProject.name)}" required>
              <select id="project-edit-team" name="teamID" class="shell-select">
                ${workspace.teams.map((team) => `<option value="${escapeHTML(team.id)}"${team.id === selectedProject.teamID ? " selected" : ""}>${escapeHTML(team.name)}</option>`).join("")}
              </select>
              <div class="inline-actions">
                <button class="shell-button" type="submit">Save project</button>
                <button class="shell-button-secondary" type="button" data-action="delete-current-project">Delete project</button>
              </div>
            </form>
          ` : renderEmpty("Unknown project", "Return to the project catalog and pick another project.")
        }),
        crudSidePanel({
          span: "span-4",
          title: "Project Catalog",
          copy: "Return to the catalog when you're done editing.",
          toolbarTitle: "Projects",
          backAction: 'data-action="open-projects"',
          backLabel: "Back to projects"
        })
      ]);
      bindFormSubmit("#view-content", "#project-edit-form", async (formData) => {
        await requestJSON(`/api/projects/${selectedProjectID}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: formData.get("name"),
            teamID: formData.get("teamID")
          })
        });
        await refreshBacklogState(() => {
          state.currentView = "projects";
        });
      }, "xbacklog-project-edit-submit");
      bindActions("#view-content", {
        "delete-current-project": async () => {
          if (!confirmDestructive("Delete this project and all related tasks?")) return;
          await requestJSON(`/api/projects/${selectedProjectID}`, { method: "DELETE" });
          await refreshBacklogState(() => {
            state.currentView = "projects";
          });
        },
        "open-projects": async () => {
          await refreshBacklogState(() => {
            state.currentView = "projects";
          });
        }
      }, "xbacklog-project-edit");
      syncBacklogRoute();
      return;
    }

    if (state.currentView === "projects") {
      setMetrics([]);
      setHeader("Projects", "Project catalog separated from create and edit flows.", `${projects.length} projects`);
      setPanels([
        crudListPanel({
          span: "span-12",
          title: "Project Catalog",
          copy: "Create, edit, or delete projects from the list instead of mixing forms into the view.",
          toolbarTitle: "Projects",
          toolbarActions: [actionButton("Create project", "primary", 'data-action="open-project-create"')],
          content: projects.length
            ? `<div class="row-list">${projects.map((project) => {
                const team = workspace.teams.find((item) => item.id === project.teamID);
                const projectTasks = tasks.filter((task) => task.projectID === project.id).length;
                return `
                  <article class="row-item two-col">
                    <div class="row-main">
                      <span class="row-title">${escapeHTML(project.name)}</span>
                      <span class="row-subtitle">${escapeHTML(team?.name || project.teamID)}</span>
                    </div>
                    <div class="row-meta">
                      <span>${escapeHTML(`${projectTasks} tasks`)}</span>
                      <div class="inline-actions">
                        <button class="shell-button-secondary" type="button" data-action="project-edit-view" data-project-id="${escapeHTML(project.id)}">Edit</button>
                        <button class="shell-button-secondary" type="button" data-action="project-delete" data-project-id="${escapeHTML(project.id)}">Delete</button>
                      </div>
                    </div>
                  </article>
                `;
              }).join("")}</div>`
            : renderEmpty("No projects", "Create the first project to begin planning.")
        })
      ]);
      bindActions("#view-content", {
        "open-project-create": async () => {
          await refreshBacklogState(() => {
            state.currentView = "project-create";
          });
        },
        "project-edit-view": async (node) => {
          await refreshBacklogState(() => {
            state.currentView = "project-edit";
            selectedTaskID = null;
            selectedProjectID = node.dataset.projectId;
          });
        },
        "project-delete": async (node) => {
          if (!confirmDestructive("Delete this project and all related tasks?")) return;
          await requestJSON(`/api/projects/${node.dataset.projectId}`, { method: "DELETE" });
          await refresh();
        }
      }, "xbacklog-projects");
      syncBacklogRoute();
      return;
    }

    if (state.currentView === "task-create") {
      mountProjectPicker();
      setMetrics([]);
      setHeader("Create Task", "Create new work from a dedicated screen instead of mixing the form into the board.", `${tasks.length} tasks`);
      setPanels([
        crudFormPanel({
          span: "span-8",
          title: "Create Task",
          copy: "Add title, description, assignee, and project assignment.",
          toolbarTitle: "Task details",
          backAction: 'data-action="open-board"',
          backLabel: backlogReturnLabel(state),
          content: `
            <form id="task-create-form" class="compact-stack">
              <input id="task-title" name="title" class="shell-input" placeholder="Task title" required>
              <textarea id="task-description" name="description" class="shell-textarea" placeholder="Description"></textarea>
              <select id="task-project" name="projectID" class="shell-select">
                ${projects.map((project) => `<option value="${escapeHTML(project.id)}">${escapeHTML(project.name)}</option>`).join("")}
              </select>
              <select id="task-assignee" name="assigneeUserID" class="shell-select">
                <option value="">Unassigned</option>
                ${workspace.users.map((user) => `<option value="${escapeHTML(user.id)}">${escapeHTML(user.displayName)}</option>`).join("")}
              </select>
              <button class="shell-button" type="submit">Create task</button>
            </form>
          `
        }),
        crudSidePanel({
          span: "span-4",
          title: "Board",
          copy: backlogReturnView(state) === "items" ? "Return to the item list after creating the task." : "Return to the board after creating the task.",
          toolbarTitle: "Tasks",
          backAction: 'data-action="open-board"',
          backLabel: backlogReturnLabel(state)
        })
      ]);
      bindFormSubmit("#view-content", "#task-create-form", async (formData) => {
        const task = await requestJSON("/api/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: formData.get("title"),
            description: formData.get("description"),
            projectID: formData.get("projectID"),
            assigneeUserID: formData.get("assigneeUserID") || null
          })
        });
        selectedTaskID = task.id;
        await refreshBacklogState(() => {
          selectedTaskID = task.id;
          state.currentView = "task-edit";
        });
      }, "xbacklog-task-create-submit");
      bindActions("#view-content", {
        "open-board": async () => {
          await refreshBacklogState(() => {
            state.currentView = backlogReturnView(state);
          });
        }
      }, "xbacklog-task-create");
      ["task-title", "task-description"].forEach((id) => shellAPI.attachTagAutocomplete(document.getElementById(id)));
      syncBacklogRoute();
      return;
    }

    if (state.currentView === "task-edit") {
      mountProjectPicker();
      const detail = selectedTaskFromLocation ? await fetchTaskDetail(selectedTaskFromLocation) : null;
      state.taskDetailTab = state.taskDetailTab === "history" ? "history" : "comments";
      setMetrics([]);
      setHeader(detail ? detail.task.title : "Task Detail", "Item detail view with timeline and discussion.", detail ? statusLabel(detail.task.status) : "No task");
      setPanels([
        crudListPanel({
          span: "span-8",
          title: "",
          copy: "",
          toolbarTitle: "",
          backAction: 'data-action="open-board"',
          backLabel: backlogReturnLabel(state),
          content: detail ? `
            <div class="task-detail-layout">
              <div class="task-detail-title-row">
                <span class="task-key-badge">${escapeHTML(issueKey(detail.task))}</span>
                <h2>${escapeHTML(detail.task.title)}</h2>
              </div>
              <section class="task-detail-section">
                <h3>Description</h3>
                <textarea id="detail-description" class="shell-textarea task-detail-description" placeholder="Task description">${escapeHTML(detail.task.description || "")}</textarea>
              </section>
              <section class="task-detail-section">
                <div class="task-detail-tabs" role="tablist" aria-label="Item timeline">
                  <button class="shell-button-secondary${state.taskDetailTab === "comments" ? " active-tab" : ""}" type="button" data-action="set-task-tab" data-tab="comments">Comments</button>
                  <button class="shell-button-secondary${state.taskDetailTab === "history" ? " active-tab" : ""}" type="button" data-action="set-task-tab" data-tab="history">History</button>
                </div>
                <div class="task-detail-tab-panel">
                  ${state.taskDetailTab === "comments"
                    ? `
                      <div class="row-list">
                        ${detail.comments.length
                          ? detail.comments.map((comment) => {
                              const author = workspace.users.find((user) => user.id === comment.authorUserID);
                              return rowItem(author ? userRef(author) : escapeHTML(comment.authorUserID), shellAPI.renderTagText(comment.body), formatDateTime(comment.createdAt), { titleHTML: true, subtitleHTML: true });
                            }).join("")
                          : renderEmpty("No comments", "Add the first comment below.")}
                      </div>
                      <form id="comment-form" class="compact-stack">
                        <textarea id="comment-body" name="body" class="shell-textarea" placeholder="Comment" required></textarea>
                        <button class="shell-button-secondary" type="submit">Add comment</button>
                      </form>
                    `
                    : `
                      <div class="row-list">
                        ${detail.history.length
                          ? detail.history.map((event) => rowItem(event.type, event.detail, formatDateTime(event.createdAt))).join("")
                          : renderEmpty("No history", "Task changes will appear here.")}
                      </div>
                    `}
                </div>
              </section>
            </div>
          ` : renderEmpty("No task selected", "Pick a task from the board.")
        }),
        crudSidePanel({
          span: "span-4",
          title: "Item Metadata",
          copy: "Context and ownership for this task.",
          toolbarTitle: "Metadata",
          backAction: 'data-action="open-board"',
          backLabel: backlogReturnLabel(state),
          content: detail ? `
            <div class="detail-grid">
              <div class="detail-block">
                <h4>Assignee</h4>
                <select id="detail-assignee" class="shell-select">
                  <option value="">Unassigned</option>
                  ${workspace.users.map((user) => `<option value="${escapeHTML(user.id)}"${user.id === detail.task.assigneeUserID ? " selected" : ""}>${escapeHTML(user.displayName)}</option>`).join("")}
                </select>
              </div>
              <div class="detail-block">
                <h4>Status</h4>
                <select id="detail-status" class="shell-select">
                  <option value="new"${detail.task.status === "new" ? " selected" : ""}>New</option>
                  <option value="in_progress"${detail.task.status === "in_progress" ? " selected" : ""}>In Progress</option>
                  <option value="done"${detail.task.status === "done" ? " selected" : ""}>Done</option>
                </select>
              </div>
              <div class="detail-block"><h4>Created</h4><p>${escapeHTML(formatDateTime(detail.task.createdAt))}</p></div>
              <div class="detail-block"><h4>Updated</h4><p>${escapeHTML(formatDateTime(detail.task.updatedAt))}</p></div>
              <div class="detail-block"><h4>Completed</h4><p>${escapeHTML(detail.task.completedAt ? formatDateTime(detail.task.completedAt) : "Not completed")}</p></div>
              <button class="shell-button-secondary" type="button" data-action="delete-current-task">Delete task</button>
            </div>
          ` : ""
        })
      ]);
      const saveTaskPatch = async (patch) => {
        await requestJSON(`/api/tasks/${selectedTaskFromLocation}`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
      };
      let descriptionAutosaveTimer = null;
      let lastDescriptionValue = detail?.task?.description || "";
      bindFormSubmit("#view-content", "#comment-form", async (formData) => {
        await requestJSON(`/api/tasks/${selectedTaskFromLocation}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: formData.get("body") })
        });
        await refresh();
      }, "xbacklog-task-comment-submit");
      bindControlInputs("#view-content", [
        {
          selector: "#detail-assignee",
          event: "change",
          handler: async (node) => {
            await saveTaskPatch({ assigneeUserID: node.value || null });
          }
        },
        {
          selector: "#detail-status",
          event: "change",
          handler: async (node) => {
            await saveTaskPatch({ status: node.value });
          }
        },
        {
          selector: "#detail-description",
          event: "input",
          handler: async (node) => {
            const value = node.value;
            clearTimeout(descriptionAutosaveTimer);
            descriptionAutosaveTimer = setTimeout(async () => {
              if (value === lastDescriptionValue) return;
              await saveTaskPatch({ description: value });
              lastDescriptionValue = value;
            }, 500);
          }
        }
      ], "xbacklog-task-edit-controls");
      bindActions("#view-content", {
        "delete-current-task": async () => {
          if (!confirmDestructive("Delete this task and its comments?")) return;
          await requestJSON(`/api/tasks/${selectedTaskFromLocation}`, { method: "DELETE" });
          await refreshBacklogState(() => {
            state.currentView = backlogReturnView(state);
          });
        },
        "open-board": async () => {
          await refreshBacklogState(() => {
            state.currentView = backlogReturnView(state);
          });
        },
        "set-task-tab": async (node) => {
          const tab = node.dataset.tab === "history" ? "history" : "comments";
          if (state.taskDetailTab === tab) return;
          state.taskDetailTab = tab;
          await refresh();
        }
      }, "xbacklog-task-edit");
      ["detail-description", "comment-body"].forEach((id) => shellAPI.attachTagAutocomplete(document.getElementById(id)));
      syncBacklogRoute();
      return;
    }

    const filteredTasks = filterTasks(tasks, projects, selectedProjectID);
    if (locationState.taskID && filteredTasks.some((task) => task.id === locationState.taskID)) {
      selectedTaskID = locationState.taskID;
    }
    selectedTaskID = filteredTasks.some((task) => task.id === selectedTaskID) ? selectedTaskID : filteredTasks[0]?.id ?? null;
    syncBacklogRoute();
    const selectedProject = projects.find((project) => project.id === selectedProjectID) || null;
    if (state.currentView === "items") {
      mountProjectPicker();
      setMetrics([]);
      setHeader("", "", "", { hidden: true });
      setPanels([
        {
          span: "span-12",
          title: selectedProject ? `${selectedProject.name} Items` : "Items",
          copy: "List and filter all items in the current project, then open one for detailed editing.",
          html: `
            ${renderBacklogControls({ workspace, syncStatus, escapeHTML, formatDateTime })}
            ${filteredTasks.length
            ? `<div class="row-list">${filteredTasks.map((task) => {
                const project = projects.find((item) => item.id === task.projectID);
                const assignee = workspace.users.find((item) => item.id === task.assigneeUserID);
                const taskComments = comments.filter((comment) => comment.taskID === task.id).length;
                return `
                  <article class="row-item two-col backlog-item-row${task.id === selectedTaskID ? " active" : ""}" data-action="select-task-item" data-task-id="${escapeHTML(task.id)}">
                    <div class="row-main">
                      <span class="row-title">
                        <button class="task-key-link" type="button" data-action="open-task-edit" data-task-id="${escapeHTML(task.id)}">${escapeHTML(issueKey(task))}</button>
                        <span>${shellAPI.renderTagText(task.title)}</span>
                      </span>
                      <span class="row-subtitle">${escapeHTML(project?.name || task.projectID)} · ${userRef(assignee, "Unassigned")}</span>
                    </div>
                    <div class="row-meta">
                      <span>${escapeHTML(statusLabel(task.status))}</span>
                      <span>${escapeHTML(`${taskComments} comments`)}</span>
                      <button class="shell-button-secondary" type="button" data-action="open-task-edit" data-task-id="${escapeHTML(task.id)}">Edit</button>
                    </div>
                  </article>
                `;
              }).join("")}</div>`
            : renderEmpty("No items", "Create work in this project or relax the filters to see matching items.")}
          `
        }
      ]);

      bindControlInputs("#view-content", [
        {
          selector: "#filter-team",
          event: "change",
          handler: async (node) => {
            boardFilters.teamID = node.value;
            await refresh();
          }
        },
        {
          selector: "#filter-assignee",
          event: "change",
          handler: async (node) => {
            boardFilters.assigneeUserID = node.value;
            await refresh();
          }
        },
        {
          selector: "#filter-query",
          event: "input",
          handler: async (node) => {
            boardFilters.query = node.value;
            await refresh();
          }
        }
      ], "xbacklog-items-filters");

      bindActions("#view-content", {
        "open-task-create": async () => {
          await refreshBacklogState(() => {
            state.backlogReturnView = "items";
            state.currentView = "task-create";
          });
        },
        "open-projects": async () => {
          await refreshBacklogState(() => {
            state.currentView = "projects";
          });
        },
        "select-task-item": async (node, event) => {
          if (event.target.closest("button")) return;
          await refreshBacklogState(() => {
            selectedTaskID = node.dataset.taskId;
            state.currentView = "task-edit";
          });
        },
        "open-task-edit": async (node) => {
          const taskID = node.dataset.taskId || selectedTaskID;
          if (!taskID) return;
          await refreshBacklogState(() => {
            state.backlogReturnView = "items";
            selectedTaskID = taskID;
            state.currentView = "task-edit";
          });
        }
      }, "xbacklog-items");

      ["filter-query"].forEach((id) => shellAPI.attachTagAutocomplete(document.getElementById(id)));
      return;
    }

    setMetrics([
      { label: "New", value: filteredTasks.filter((task) => task.status === "new").length, meta: "Fresh work" },
      { label: "In Progress", value: filteredTasks.filter((task) => task.status === "in_progress").length, meta: "Active execution" },
      { label: "Done", value: filteredTasks.filter((task) => task.status === "done").length, meta: "Completed work" }
    ]);
    mountProjectPicker();
    setHeader("", "", "", { hidden: true });
    setPanels([
      {
        span: "span-12",
        title: selectedProject ? selectedProject.name : "Board",
        copy: "Drag tasks between columns. Open details from the issue key shown before each title.",
        html: `
          ${renderBacklogControls({ workspace, syncStatus, escapeHTML, formatDateTime, includeSync: true })}
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
      }
    ]);

    bindControlInputs("#view-content", [
      {
        selector: "#filter-team",
        event: "change",
        handler: async (node) => {
          boardFilters.teamID = node.value;
          await refresh();
        }
      },
      {
        selector: "#filter-assignee",
        event: "change",
        handler: async (node) => {
          boardFilters.assigneeUserID = node.value;
          await refresh();
        }
      },
      {
        selector: "#filter-query",
        event: "input",
        handler: async (node) => {
          boardFilters.query = node.value;
          await refresh();
        }
      }
    ], "xbacklog-filters");

    bindActions("#view-content", {
      "open-projects": async () => {
        await refreshBacklogState(() => {
          state.currentView = "projects";
        });
      },
      "sync-workspace": async () => {
        await syncWorkspace();
        await refresh();
      },
      "open-task-create": async () => {
        await refreshBacklogState(() => {
          state.backlogReturnView = "board";
          state.currentView = "task-create";
        });
      },
      "open-task-edit": async (node) => {
        const taskID = node.dataset.taskId || selectedTaskID;
        if (!taskID) return;
        await refreshBacklogState(() => {
          state.backlogReturnView = "board";
          selectedTaskID = taskID;
          state.currentView = "task-edit";
        });
      },
      "select-task-card": async (node) => {
        await refreshBacklogState(() => {
          selectedTaskID = node.dataset.taskId;
        });
      }
    }, "xbacklog-board");

    bindDragDrop("#view-content", {
      draggableSelector: ".task-card",
      dropZoneSelector: ".board-column",
      getPayload: (node) => node.dataset.taskId,
      onDragEnd: () => {
        document.querySelectorAll(".board-column").forEach((column) => column.classList.remove("drop-target"));
      },
      onDragOver: async (_payload, node) => {
        node.classList.add("drop-target");
      },
      onDragLeave: async (_payload, node) => {
        node.classList.remove("drop-target");
      },
      onDrop: async (taskID, node) => {
        node.classList.remove("drop-target");
        await requestJSON(`/api/tasks/${taskID}/status`, {
          method: "POST",
          body: JSON.stringify({ status: node.dataset.status })
        });
        selectedTaskID = taskID;
        await refresh();
      }
    }, "xbacklog-board-dnd");

    ["filter-query"].forEach((id) => shellAPI.attachTagAutocomplete(document.getElementById(id)));
  }
});

shell.refresh().catch((error) => {
  document.getElementById("app").innerHTML = `<pre>${shellAPI.escapeHTML(error.message)}</pre>`;
});
