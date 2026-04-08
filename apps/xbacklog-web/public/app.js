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
  projectID: "all",
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

function taskCard(task, projectName, assignee, active) {
  return `
    <article class="task-card${active ? " active" : ""}" data-action="select-task-card" data-task-id="${task.id}" draggable="true">
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
  loadUsers: shellAPI.loadUsers,
  loadSession: shellAPI.loadSession,
  onLogin: shellAPI.createSession,
  onLogout: shellAPI.destroySession,
  renderView: async ({ setHeader, setMetrics, setPanels, renderEmpty, escapeHTML, formatDateTime, refresh, state }) => {
    const locationState = backlogRouter.read();
    if (["board", "projects", "comments", "task-create", "task-edit", "project-create", "project-edit"].includes(locationState.view) && locationState.view !== state.currentView) {
      state.currentView = locationState.view;
    }

    const payload = await fetchBacklog();
    const { workspace, projects, tasks, comments, syncStatus } = payload;
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
      refreshBacklogState(() => {});
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
      refreshBacklogState(() => {});
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
      refreshBacklogState(() => {});
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

    if (state.currentView === "task-create") {
      setMetrics([]);
      setHeader("Create Task", "Create new work from a dedicated screen instead of mixing the form into the board.", `${tasks.length} tasks`);
      setPanels([
        crudFormPanel({
          span: "span-8",
          title: "Create Task",
          copy: "Add title, description, assignee, and project assignment.",
          toolbarTitle: "Task details",
          backAction: 'data-action="open-board"',
          backLabel: "Back to board",
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
          copy: "Return to the board after creating the task.",
          toolbarTitle: "Tasks",
          backAction: 'data-action="open-board"',
          backLabel: "Back to board"
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
            state.currentView = "board";
          });
        }
      }, "xbacklog-task-create");
      ["task-title", "task-description"].forEach((id) => shellAPI.attachTagAutocomplete(document.getElementById(id)));
      refreshBacklogState(() => {});
      return;
    }

    if (state.currentView === "task-edit") {
      const detail = selectedTaskFromLocation ? await fetchTaskDetail(selectedTaskFromLocation) : null;
      setMetrics([]);
      setHeader(detail ? detail.task.title : "Task Detail", "Update one task at a time from a dedicated edit screen.", detail ? statusLabel(detail.task.status) : "No task");
      setPanels([
        crudFormPanel({
          span: "span-8",
          title: detail ? detail.task.title : "Task Detail",
          copy: detail ? "Inspect the task, update metadata, and review history." : "Return to the board and pick another task.",
          toolbarTitle: detail?.task?.title || "Task details",
          backAction: 'data-action="open-board"',
          backLabel: "Back to board",
          content: detail ? `
            <div class="detail-grid">
              <form id="task-detail-form" class="compact-stack">
                <input id="detail-title" name="title" class="shell-input" value="${escapeHTML(detail.task.title)}" required>
                <textarea id="detail-description" name="description" class="shell-textarea" placeholder="Description">${escapeHTML(detail.task.description || "")}</textarea>
                <select id="detail-assignee" name="assigneeUserID" class="shell-select">
                  <option value="">Unassigned</option>
                  ${workspace.users.map((user) => `<option value="${escapeHTML(user.id)}"${user.id === detail.task.assigneeUserID ? " selected" : ""}>${escapeHTML(user.displayName)}</option>`).join("")}
                </select>
                <div class="inline-actions">
                  <button class="shell-button" type="submit">Save task</button>
                  <button class="shell-button-secondary" type="button" data-action="delete-current-task">Delete task</button>
                </div>
              </form>

              <div class="detail-block"><h4>Status</h4><p>${escapeHTML(statusLabel(detail.task.status))}</p></div>
              <div class="detail-block"><h4>Created</h4><p>${escapeHTML(formatDateTime(detail.task.createdAt))}</p></div>
              <div class="detail-block"><h4>Updated</h4><p>${escapeHTML(formatDateTime(detail.task.updatedAt))}</p></div>
              <div class="detail-block"><h4>Completed</h4><p>${escapeHTML(detail.task.completedAt ? formatDateTime(detail.task.completedAt) : "Not completed")}</p></div>
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
                <textarea id="comment-body" name="body" class="shell-textarea" placeholder="Comment" required></textarea>
                <button class="shell-button-secondary" type="submit">Add comment</button>
              </form>
            </div>
          ` : renderEmpty("No task selected", "Pick a task from the board.")
        }),
        crudSidePanel({
          span: "span-4",
          title: "Board",
          copy: "Return to the board when you're done editing.",
          toolbarTitle: "Tasks",
          backAction: 'data-action="open-board"',
          backLabel: "Back to board"
        })
      ]);
      bindFormSubmit("#view-content", "#task-detail-form", async (formData) => {
        await requestJSON(`/api/tasks/${selectedTaskFromLocation}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: formData.get("title"),
            description: formData.get("description"),
            assigneeUserID: formData.get("assigneeUserID") || null
          })
        });
        await refresh();
      }, "xbacklog-task-edit-submit");
      bindFormSubmit("#view-content", "#comment-form", async (formData) => {
        await requestJSON(`/api/tasks/${selectedTaskFromLocation}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: formData.get("body") })
        });
        await refresh();
      }, "xbacklog-task-comment-submit");
      bindActions("#view-content", {
        "delete-current-task": async () => {
          if (!confirmDestructive("Delete this task and its comments?")) return;
          await requestJSON(`/api/tasks/${selectedTaskFromLocation}`, { method: "DELETE" });
          await refreshBacklogState(() => {
            state.currentView = "board";
          });
        },
        "open-board": async () => {
          await refreshBacklogState(() => {
            state.currentView = "board";
          });
        }
      }, "xbacklog-task-edit");
      ["detail-title", "detail-description", "comment-body"].forEach((id) => shellAPI.attachTagAutocomplete(document.getElementById(id)));
      refreshBacklogState(() => {});
      return;
    }

    const filteredTasks = filterTasks(tasks, projects);
    if (locationState.taskID && filteredTasks.some((task) => task.id === locationState.taskID)) {
      selectedTaskID = locationState.taskID;
    }
    selectedTaskID = filteredTasks.some((task) => task.id === selectedTaskID) ? selectedTaskID : filteredTasks[0]?.id ?? null;
    refreshBacklogState(() => {});

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
            <button class="shell-button-secondary" type="button" data-action="sync-workspace">Sync from xGroup</button>
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
        title: "Task Actions",
        copy: "Create a task or open one from the board for editing.",
        html: `
          ${sectionToolbar("Tasks", [actionButton("Create task", "primary", 'data-action="open-task-create"')])}
          ${selectedTaskID
            ? `<div class="row-list">
                <article class="row-item two-col">
                  <div class="row-main">
                    <span class="row-title">${escapeHTML(tasks.find((task) => task.id === selectedTaskID)?.title || "Selected task")}</span>
                    <span class="row-subtitle">Open the selected task in a dedicated edit screen.</span>
                  </div>
                  <div class="row-meta">
                    <button class="shell-button-secondary" type="button" data-action="open-task-edit">Edit selected</button>
                  </div>
                </article>
              </div>`
            : renderEmpty("No task selected", "Choose a task from the board to edit it.")}
        `
      }
    ]);

    bindControlInputs("#view-content", [
      {
        selector: "#filter-project",
        event: "change",
        handler: async (node) => {
          boardFilters.projectID = node.value;
          await refresh();
        }
      },
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
      "sync-workspace": async () => {
        await syncWorkspace();
        await refresh();
      },
      "open-task-create": async () => {
        await refreshBacklogState(() => {
          state.currentView = "task-create";
        });
      },
      "open-task-edit": async () => {
        if (!selectedTaskID) return;
        await refreshBacklogState(() => {
          state.currentView = "task-edit";
        });
      },
      "select-task-card": async (node) => {
        await refreshBacklogState(() => {
          selectedTaskID = node.dataset.taskId;
          state.currentView = "task-edit";
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
