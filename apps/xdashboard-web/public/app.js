const shellAPI = window.XHarborShell;

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

async function fetchDashboard() {
  return requestJSON("/api/dashboard", { headers: {} });
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
  return requestJSON("/api/session", { method: "DELETE" });
}

async function refreshSources() {
  return requestJSON("/api/dashboard/refresh", {
    method: "POST",
    body: JSON.stringify({})
  });
}

function rowItem(title, subtitle, meta = "") {
  return `
    <article class="row-item two-col">
      <div class="row-main">
        <span class="row-title">${shellAPI.escapeHTML(title)}</span>
        <span class="row-subtitle">${shellAPI.escapeHTML(subtitle)}</span>
      </div>
      <div class="row-meta">${shellAPI.escapeHTML(meta)}</div>
    </article>
  `;
}

function userRef(user, fallback = "Unknown user") {
  if (!user) return shellAPI.escapeHTML(fallback);
  return `<span class="user-ref-inline" data-user-id="${shellAPI.escapeHTML(user.id)}">${shellAPI.renderAvatar(user)}<span>${shellAPI.escapeHTML(user.displayName)}</span></span>`;
}

function denseTable(headers, rows) {
  return `
    <div class="dash-table">
      <div class="dash-row dash-head">
        ${headers.map((header) => `<span class="dash-cell">${shellAPI.escapeHTML(header)}</span>`).join("")}
      </div>
      ${rows.map((row) => `
        <div class="dash-row">
          ${row.map((cell) => `<span class="dash-cell">${cell}</span>`).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

const shell = shellAPI.createShell({
  appName: "xDashboard",
  appSubtitle: "Cross-module reporting center",
  shellClassName: "shell-platform",
  defaultView: "overview",
  navigation: [
    {
      section: "Insights",
      items: [
        { id: "overview", label: "Overview", copy: "Executive summary and source refresh." },
        { id: "risks", label: "Risks", copy: "Blocked work and operational warnings." },
        { id: "teams", label: "Team Load", copy: "Capacity and workload by team and user." },
        { id: "activity", label: "Activity", copy: "Recent comments and task flow." }
      ]
    },
    {
      section: "System",
      items: [
        { id: "settings", label: "Settings", copy: "Accent palette and timezone preferences." }
      ]
    }
  ],
  loadUsers,
  loadSession,
  onLogin: createSession,
  onLogout: destroySession,
  renderView: async ({ state, setHeader, setMetrics, setPanels, renderEmpty, dataCard, escapeHTML, formatDateTime, refresh }) => {
    if (!state.session.authenticated) {
      setHeader("Dashboard Access", "Reporting is available after authentication through the shared top-right login control.", "Signed out");
      setMetrics([]);
      setPanels([
        {
          span: "span-12",
          title: "Locked",
          copy: "Authenticate to pull data from xGroup and xBacklog.",
          html: renderEmpty("Sign in required", "Use the right side of the nav bar to authenticate into xDashboard.")
        }
      ]);
      return;
    }

    const dashboard = await fetchDashboard();

    if (state.currentView === "overview") {
      setMetrics([
        { label: "Teams", value: dashboard.summary.teamCount, meta: "Across the workspace" },
        { label: "Projects", value: dashboard.summary.projectCount, meta: "Reporting source scope" },
        { label: "Tasks", value: dashboard.summary.taskCount, meta: "Delivery flow volume" },
        { label: "Done", value: dashboard.summary.completedTaskCount, meta: "Completed work" }
      ]);
      setHeader("Executive Summary", "A compact reporting view with refresh controls and high-level metrics separated from the detailed analysis screens.", dashboard.syncStatus.lastSyncSucceeded ? "Sources synced" : "Sync pending");
      setPanels([
        {
          span: "span-5",
          title: "Source Refresh",
          copy: "Pull a fresh reporting snapshot from the backing services.",
          html: `
            <div class="surface-stack">
              ${denseTable(
                ["Field", "Value"],
                [
                  [escapeHTML("Last refresh"), escapeHTML(dashboard.syncStatus.lastSyncAt ? formatDateTime(dashboard.syncStatus.lastSyncAt) : dashboard.syncStatus.lastError || "No refresh yet")],
                  [escapeHTML("Sources"), escapeHTML(`${dashboard.summary.teamCount} teams · ${dashboard.summary.projectCount} projects · ${dashboard.summary.taskCount} tasks`)]
                ]
              )}
              <button id="refresh-button" class="shell-button" type="button">Refresh sources</button>
            </div>
          `
        },
        {
          span: "span-7",
          title: "Reports",
          copy: "Top-level report definitions visible without pushing every chart onto one page.",
          html: dashboard.reports.length
            ? `<div class="row-list">${dashboard.reports.map((report) => rowItem(report.title, report.description)).join("")}</div>`
            : renderEmpty("No reports", "Refresh the sources to materialize reports.")
        },
        {
          span: "span-12",
          title: "Status Distribution",
          copy: "Task state totals in the selected timezone context.",
          html: denseTable(
            ["Status", "Tasks"],
            dashboard.statusBreakdown.map((status) => [escapeHTML(status.label), escapeHTML(`${status.count} tasks`)])
          )
        },
        {
          span: "span-12",
          title: "Recently Completed",
          copy: "Recently finished tasks based on completion timestamps from xBacklog.",
          html: dashboard.recentlyCompletedTasks.length
            ? denseTable(
                ["Task", "Project", "Completed"],
                dashboard.recentlyCompletedTasks.map((task) => [
                  escapeHTML(task.title),
                  `${escapeHTML(task.projectName)} · ${task.assigneeUserID ? userRef(task.assigneeUserID, task.assigneeName) : escapeHTML(task.assigneeName)}`,
                  escapeHTML(formatDateTime(task.completedAt))
                ])
              )
            : renderEmpty("No completed tasks", "Completed work will appear here once items reach Done.")
        }
      ]);

      document.getElementById("refresh-button")?.addEventListener("click", async () => {
        await refreshSources();
        await refresh();
      });
      return;
    }

    if (state.currentView === "risks") {
      setMetrics([]);
      setHeader("Risks", "Blocked work and alerts are isolated into a dedicated operational view instead of sharing space with every other dashboard card.", `${dashboard.risks.length} risks`);
      setPanels([
        {
          span: "span-5",
          title: "Risk Register",
          copy: "High-level warnings derived from the delivery flow.",
          html: dashboard.risks.length
            ? `<div class="row-list">${dashboard.risks.map((risk) => `
                <article class="data-card ${risk.level === "critical" ? "risk-critical" : "risk-warning"}">
                  <h3>${escapeHTML(risk.title)}</h3>
                  <p>${escapeHTML(risk.level)} · ${escapeHTML(risk.detail)}</p>
                </article>
              `).join("")}</div>`
            : renderEmpty("No active risks", "Current data does not expose critical issues.")
        },
        {
          span: "span-7",
          title: "Blocked Tasks",
          copy: "Tasks stuck in blocked status are grouped here for follow-up.",
          html: dashboard.blockedTaskCards.length
            ? denseTable(
                ["Task", "Project", "Owner"],
                dashboard.blockedTaskCards.map((task) => [
                  escapeHTML(task.title),
                  escapeHTML(task.projectName),
                  task.assigneeUserID ? userRef(task.assigneeUserID, task.assigneeName) : escapeHTML(task.assigneeName)
                ])
              )
            : renderEmpty("No blocked work", "Blocked tasks will appear here.")
        }
      ]);
      return;
    }

    if (state.currentView === "teams") {
      setMetrics([]);
      setHeader("Team Load", "Team and user workload moved into a dedicated analysis area instead of stretching the main summary screen.", `${dashboard.teamCards.length} teams`);
      setPanels([
        {
          span: "span-6",
          title: "Teams",
          copy: "Project and task load by team.",
          html: denseTable(
            ["Team", "Load", "Blocked"],
            dashboard.teamCards.map((team) => [
              escapeHTML(team.name),
              escapeHTML(`${team.memberCount} members · ${team.projectCount} projects · ${team.taskCount} tasks`),
              escapeHTML(`${team.blockedTaskCount}`)
            ])
          )
        },
        {
          span: "span-6",
          title: "Users",
          copy: "Assigned work and completion by user.",
          html: denseTable(
            ["User", "Assignments", "Done"],
            dashboard.userCards.map((user) => [
              userRef(user),
              escapeHTML(`${user.roles.join(", ") || "no team role"} · ${user.assignedTaskCount} assigned`),
              escapeHTML(`${user.completedTaskCount}`)
            ])
          )
        }
      ]);
      return;
    }

    if (state.currentView === "activity") {
      setMetrics([]);
      setHeader("Recent Activity", "Recent delivery discussion and task history in one compact operational timeline.", `${dashboard.summary.taskEventCount} task events`);
      setPanels([
        {
          span: "span-6",
          title: "Recent Comments",
          copy: "Recent workflow discussion rendered using the selected timezone.",
          html: dashboard.recentComments.length
            ? denseTable(
                ["Comment", "Body", "When"],
                dashboard.recentComments.map((comment) => [
                  `${comment.authorUserID ? userRef({ id: comment.authorUserID, displayName: comment.authorName }) : escapeHTML(comment.authorName)} on ${escapeHTML(comment.taskTitle)}`,
                  escapeHTML(comment.body),
                  escapeHTML(formatDateTime(comment.createdAt))
                ])
              )
            : renderEmpty("No comment activity", "Workflow discussion will appear here.")
        },
        {
          span: "span-6",
          title: "Task History",
          copy: "Changes coming from task create, update, comment, and status transition events.",
          html: dashboard.recentTaskChanges.length
            ? denseTable(
                ["Event", "Detail", "When"],
                dashboard.recentTaskChanges.map((event) => [
                  `${event.actorUserID ? userRef(event.actorUserID, event.actorName) : escapeHTML(event.actorName)} · ${escapeHTML(event.taskTitle)}`,
                  escapeHTML(`${event.type} · ${event.detail}`),
                  escapeHTML(formatDateTime(event.createdAt))
                ])
              )
            : renderEmpty("No task history", "Task changes will appear here after the next board actions.")
        }
      ]);
    }
  }
});

shell.refresh().catch((error) => {
  document.getElementById("app").innerHTML = `<pre>${shellAPI.escapeHTML(error.message)}</pre>`;
});
