const shellAPI = window.XHarborShell;
const requestJSON = shellAPI.requestJSON;
const actionButton = shellAPI.actionButton;
const sectionToolbar = shellAPI.sectionToolbar;
const rowItem = shellAPI.rowItem;

function membershipKey(membership) {
  return `${membership.userID}::${membership.teamID}`;
}

function parseMembershipKey(value) {
  const [userID, teamID] = value.split("::");
  return { userID, teamID };
}

function roleSummary(snapshot, userID) {
  return snapshot.memberships
    .filter((membership) => membership.userID === userID)
    .map((membership) => {
      const team = snapshot.teams.find((item) => item.id === membership.teamID);
      return `${team?.name || membership.teamID}: ${membership.role}`;
    })
    .join(", ");
}

function optionMarkup(items, getValue, getLabel, selectedValue) {
  return items.map((item) => {
    const value = getValue(item);
    const selected = value === selectedValue ? " selected" : "";
    return `<option value="${shellAPI.escapeHTML(value)}"${selected}>${shellAPI.escapeHTML(getLabel(item))}</option>`;
  }).join("");
}

function actionsMarkup(actions) {
  return `<div class="inline-actions">${actions.join("")}</div>`;
}

function managerOptions(users, selectedValue = "") {
  return [
    `<option value="">No manager</option>`,
    ...users.map((user) => `<option value="${shellAPI.escapeHTML(user.id)}"${user.id === selectedValue ? " selected" : ""}>${shellAPI.escapeHTML(user.displayName)}</option>`)
  ].join("");
}

function userRef(user, fallback = "Unknown user") {
  return shellAPI.renderUserRef(user, fallback);
}

function userFullName(user) {
  const parts = [user?.firstName, user?.lastName].filter((value) => value && String(value).trim());
  return parts.length ? parts.join(" ") : user?.displayName || "Unknown user";
}

function renderUserAvatar(user, className = "") {
  return shellAPI.renderAvatar(user, className);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

async function selectedAvatarDataURL(inputID) {
  const file = document.getElementById(inputID)?.files?.[0];
  if (!file) return undefined;
  return readFileAsDataURL(file);
}

function userTeamSummary(snapshot, userID) {
  return snapshot.memberships
    .filter((membership) => membership.userID === userID)
    .map((membership) => snapshot.teams.find((team) => team.id === membership.teamID)?.name || membership.teamID)
    .join(", ");
}

function buildOrgTree(snapshot) {
  const uniqueUsers = [...new Map(snapshot.users.map((user) => [user.id, user])).values()];
  const childrenByManager = new Map();
  uniqueUsers.forEach((user) => {
    const key = user.managerUserID || "__root__";
    if (!childrenByManager.has(key)) childrenByManager.set(key, []);
    childrenByManager.get(key).push(user);
  });

  function sortUsers(users) {
    return [...users].sort((left, right) => userFullName(left).localeCompare(userFullName(right)));
  }

  function visit(user, seen = new Set()) {
    if (seen.has(user.id)) {
      return { ...user, children: [] };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(user.id);
    const children = sortUsers(childrenByManager.get(user.id) || []).map((child) => visit(child, nextSeen));
    return { ...user, children };
  }

  const roots = sortUsers(
    uniqueUsers.filter((user) => !user.managerUserID || !uniqueUsers.some((candidate) => candidate.id === user.managerUserID))
  );
  return roots.map((user) => visit(user));
}

function buildManagerMap(snapshot) {
  return new Map(snapshot.users.map((user) => [user.id, user.managerUserID || null]));
}

function buildAncestorSet(managerMap, userID) {
  const selected = new Set();
  let current = userID;
  while (current) {
    if (selected.has(current)) break;
    selected.add(current);
    current = managerMap.get(current) || null;
  }
  return selected;
}

function collectBranchIDs(nodes, bucket = new Set()) {
  nodes.forEach((node) => {
    if (node.children?.length) {
      bucket.add(node.id);
      collectBranchIDs(node.children, bucket);
    }
  });
  return bucket;
}

function renderOrgTree(snapshot, nodes, collapsedNodes, depth = 0) {
  return `
    <ul class="org-tree-level${depth === 0 ? " root" : ""}"${depth > 0 ? ' data-org-children-level="true"' : ""}>
      ${nodes.map((user) => `
        <li class="org-branch" style="--org-depth:${Math.min(depth, 4)}" data-org-user-id="${shellAPI.escapeHTML(user.id)}">
          <div class="org-branch-node">
            <article class="org-card" data-action="select-org-user" data-user-id="${shellAPI.escapeHTML(user.id)}">
        ${user.children?.length
          ? `<button class="org-toggle" type="button" data-action="toggle-org-node" data-user-id="${shellAPI.escapeHTML(user.id)}" aria-expanded="${collapsedNodes.has(user.id) ? "false" : "true"}"><i class="fa-solid ${collapsedNodes.has(user.id) ? "fa-plus" : "fa-minus"}" aria-hidden="true"></i></button>`
          : `<span class="org-toggle org-toggle-placeholder" aria-hidden="true"></span>`}
        ${renderUserAvatar(user, "org-avatar")}
        <div class="org-card-main">
          <strong data-user-id="${shellAPI.escapeHTML(user.id)}">${shellAPI.escapeHTML(userFullName(user))}</strong>
          <span class="org-card-sub">${shellAPI.escapeHTML(user.title || "No title")}</span>
          <span class="org-card-meta">${shellAPI.escapeHTML(user.department || "No department")} · ${shellAPI.escapeHTML(userTeamSummary(snapshot, user.id) || "No teams")}</span>
        </div>
        <div class="org-card-side">
          <span class="status-pill">${shellAPI.escapeHTML(user.status)}</span>
          <span class="dense-sub">${shellAPI.escapeHTML(user.displayName)}</span>
        </div>
            </article>
          </div>
          ${user.children?.length && !collapsedNodes.has(user.id) ? `<div class="org-children">${renderOrgTree(snapshot, user.children, collapsedNodes, depth + 1)}</div>` : ""}
        </li>
      `).join("")}
    </ul>
  `;
}

function layoutHorizontalOrgTree(container) {
  if (!container) return;
  const canvas = container.querySelector(".org-tree-canvas");
  if (!canvas) return;

  let svg = canvas.querySelector(".org-tree-lines");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("org-tree-lines");
    canvas.prepend(svg);
  }

  const canvasRect = canvas.getBoundingClientRect();
  const width = Math.ceil(canvas.scrollWidth);
  const height = Math.ceil(canvas.scrollHeight);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";

  const stroke = "rgba(15,23,42,0.12)";
  const strokeWidth = "1";
  const busOffset = 16;

  const branches = [...canvas.querySelectorAll(".org-tree.horizontal .org-branch")];
  for (const branch of branches) {
    const branchNode = branch.querySelector(":scope > .org-branch-node .org-card");
    const childLevel = branch.querySelector(":scope > .org-children > .org-tree-level");
    if (!branchNode || !childLevel) continue;

    const childCards = [...childLevel.querySelectorAll(":scope > .org-branch > .org-branch-node .org-card")];
    if (!childCards.length) continue;

    const parentRect = branchNode.getBoundingClientRect();
    const childLevelRect = childLevel.getBoundingClientRect();
    const parentX = parentRect.left + parentRect.width / 2 - canvasRect.left;
    const parentBottomY = parentRect.bottom - canvasRect.top;
    const busY = childLevelRect.top - canvasRect.top + busOffset;

    const parentUserID = branch.dataset.orgUserId;

    for (const childCard of childCards) {
      const childRect = childCard.getBoundingClientRect();
      const childX = childRect.left + childRect.width / 2 - canvasRect.left;
      const childTopY = childRect.top - canvasRect.top;
      const childUserID = childCard.closest(".org-branch")?.dataset.orgUserId || "";
      const edge = document.createElementNS("http://www.w3.org/2000/svg", "path");
      edge.setAttribute("d", `M ${parentX} ${parentBottomY} L ${parentX} ${busY} L ${childX} ${busY} L ${childX} ${childTopY}`);
      edge.setAttribute("fill", "none");
      edge.setAttribute("stroke", stroke);
      edge.setAttribute("stroke-width", strokeWidth);
      edge.setAttribute("stroke-linecap", "round");
      edge.setAttribute("stroke-linejoin", "round");
      edge.dataset.orgLine = "edge";
      edge.dataset.orgParent = parentUserID || "";
      edge.dataset.orgChild = childUserID;
      svg.appendChild(edge);
    }
  }
}

function highlightHorizontalOrgTree(container, selectedIDs) {
  if (!container) return;
  const selected = selectedIDs || new Set();
  container.querySelectorAll(".org-branch").forEach((branch) => {
    const isSelected = selected.has(branch.dataset.orgUserId);
    branch.classList.toggle("org-branch-selected", isSelected);
  });
  const svg = container.querySelector(".org-tree-lines");
  if (!svg) return;
  svg.querySelectorAll("[data-org-line]").forEach((line) => {
    const parentID = line.dataset.orgParent;
    const childID = line.dataset.orgChild;
    const highlighted = line.dataset.orgLine === "edge"
      ? selected.has(parentID) && selected.has(childID)
      : selected.has(parentID);
    line.classList.toggle("org-line-highlight", highlighted);
  });
}

function denseTable(headers, rows) {
  return `
    <div class="dense-table">
      <div class="dense-row dense-head">
        ${headers.map((header) => `<span class="dense-cell">${shellAPI.escapeHTML(header)}</span>`).join("")}
      </div>
      ${rows.map((row) => `
        <div class="dense-row">
          ${row.map((cell) => `<span class="dense-cell">${cell}</span>`).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

function ensureDirectoryRoutes(state) {
  state.directoryRoutes ??= {};
  return state.directoryRoutes;
}

function getDirectoryRoute(state, view) {
  return ensureDirectoryRoutes(state)[view] || { mode: "list" };
}

function setDirectoryRoute(state, view, mode, context = {}) {
  ensureDirectoryRoutes(state)[view] = { mode, ...context };
}

function resetDirectoryRoute(state, view) {
  ensureDirectoryRoutes(state)[view] = { mode: "list" };
}

async function loadWorkspace() {
  return requestJSON("/api/workspace", { headers: {} });
}

async function loadUsers() {
  const workspace = await loadWorkspace();
  return workspace.snapshot.users;
}

async function loadPresence() {
  return requestJSON("/api/presence", { headers: {} });
}

async function loadInvitations() {
  return requestJSON("/api/invitations", { headers: {} });
}

async function loadAdminSessions() {
  return requestJSON("/api/admin/sessions", { headers: {} });
}

const shell = shellAPI.createShell({
  appName: "xGroup",
  appSubtitle: "Organization source of truth",
  shellClassName: "shell-group",
  defaultView: "overview",
  navigation: [
    {
      section: "Directory",
      items: [
        { id: "overview", label: "Overview", copy: "Workspace health, events, and active roles." },
        { id: "teams", label: "Teams", copy: "Create and maintain delivery groups." },
        { id: "users", label: "People", copy: "Provision users and control account status." },
        { id: "structure", label: "Structure", copy: "Browse the reporting tree across managers." },
        { id: "memberships", label: "Memberships", copy: "Attach people to teams with roles." }
      ]
    },
    {
      section: "Administration",
      items: [
        { id: "invitations", label: "Invitations", copy: "Provision future users into the workspace." },
        { id: "sessions", label: "Sessions", copy: "Inspect and revoke active sessions." },
        { id: "settings", label: "Settings", copy: "Accent palette and timezone preferences." }
      ]
    }
  ],
  loadUsers,
  loadSession: shellAPI.loadSession,
  onLogin: shellAPI.createSession,
  onLogout: shellAPI.destroySession,
  renderView: async ({ state, setHeader, setMetrics, setPanels, renderEmpty, dataCard, actionButton, escapeHTML, formatDateTime, refresh }) => {
    const [workspace, invitations, presence, adminSessions] = await Promise.all([
      loadWorkspace(),
      loadInvitations().catch(() => []),
      loadPresence().catch(() => []),
      state.currentView === "sessions" || state.currentView === "overview" ? loadAdminSessions().catch(() => []) : Promise.resolve([])
    ]);

    const snapshot = workspace.snapshot;
    if (state.currentView === "overview") {
      setMetrics([
        { label: "Teams", value: snapshot.teams.length, meta: "Active delivery units" },
        { label: "Users", value: snapshot.users.length, meta: "People in directory" },
        { label: "Memberships", value: snapshot.memberships.length, meta: "Role assignments" },
        { label: "Events", value: workspace.events.length, meta: "Workspace lifecycle events" }
      ]);
      setHeader("Organization Workspace", "Track the current directory, account health, and the latest structural changes across teams.", `${snapshot.organization.name}`);
      const recentEvents = workspace.events.slice(-6).reverse();
      const onlineUsers = presence.filter((item) => item.isOnline).length;
      const activeUsers = snapshot.users.filter((user) => user.status === "active").length;

      setPanels([
        {
          span: "span-7",
          title: "Directory Snapshot",
          copy: "The central source of truth used by the rest of xHarbor.",
          badge: `${activeUsers} active accounts`,
          html: `
            ${denseTable(
              ["Field", "Value"],
              [
                [escapeHTML("Organization"), escapeHTML(snapshot.organization.name)],
                [escapeHTML("Coverage"), escapeHTML(`${snapshot.teams.length} teams · ${snapshot.memberships.length} role links`)],
                [escapeHTML("Presence"), escapeHTML(`${onlineUsers} online · ${activeUsers} active accounts`)],
                [escapeHTML("Current access"), escapeHTML(state.session.authenticated ? (roleSummary(snapshot, state.session.user.id) || "No direct role mapping") : "Sign in from the right side of the nav bar.")]
              ]
            )}
          `
        },
        {
          span: "span-5",
          title: "Latest Events",
          copy: "Recent directory changes are normalized through the selected timezone.",
          html: recentEvents.length
            ? `<div class="event-list">${recentEvents.map((event) => `
                <article class="event-row">
                  <div>
                    <strong>${escapeHTML(event.type)}</strong>
                    <span class="muted">${escapeHTML(event.entityID || "workspace")}</span>
                  </div>
                  <time>${escapeHTML(formatDateTime(event.createdAt))}</time>
                </article>
              `).join("")}</div>`
            : renderEmpty("No events", "Directory changes will appear here.")
        },
        {
          span: "span-12",
          title: "Current Roles",
          copy: "Active users and the team roles they currently hold.",
          html: denseTable(
            ["Person", "Memberships", "Status"],
            snapshot.users.map((user) => {
              const status = presence.find((item) => item.userID === user.id)?.isOnline ? "online" : "offline";
              return [
                `<strong>${userRef(user)}</strong><span class="dense-sub">${escapeHTML(user.email)}</span>`,
                escapeHTML(roleSummary(snapshot, user.id) || "No memberships"),
                `<span class="status-pill">${escapeHTML(user.status)}</span><span class="dense-sub">${escapeHTML(status)}</span>`
              ];
            })
          )
        }
      ]);
      return;
    }

    if (state.currentView === "teams") {
      setMetrics([]);
      const route = getDirectoryRoute(state, "teams");
      const selectedTeam = route.teamID ? snapshot.teams.find((team) => team.id === route.teamID) : null;
      setHeader("Teams", "Manage workspace teams through dedicated list, create, and edit screens.", `${snapshot.teams.length} teams`);

      if (route.mode === "create") {
        setPanels([{
          span: "span-12",
          title: "Create Team",
          copy: "Add a new delivery group without mixing the form into the registry view.",
          html: `
            ${sectionToolbar("Team details", [actionButton("Back to list", "secondary", `data-action="teams-back"`)] )}
            <form id="team-create-form" class="surface-stack">
              <input id="team-name" class="shell-input" placeholder="Team name" required>
              <div class="inline-actions">
                <button class="shell-button" type="submit">Create team</button>
              </div>
            </form>
          `
        }]);
        document.getElementById("team-create-form")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          await requestJSON("/api/teams", { method: "POST", body: JSON.stringify({ name: document.getElementById("team-name").value }) });
          resetDirectoryRoute(state, "teams");
          await refresh();
        });
      } else if (route.mode === "edit" && selectedTeam) {
        setPanels([{
          span: "span-12",
          title: "Edit Team",
          copy: "Update one team at a time from a dedicated edit screen.",
          html: `
            ${sectionToolbar(selectedTeam.name, [actionButton("Back to list", "secondary", `data-action="teams-back"`)] )}
            <form id="team-edit-form" class="surface-stack">
              <input id="team-edit-name" class="shell-input" value="${escapeHTML(selectedTeam.name)}" required>
              <div class="inline-actions">
                <button class="shell-button" type="submit">Save team</button>
                <button id="team-delete-button" class="shell-button-danger" type="button">Delete team</button>
              </div>
            </form>
          `
        }]);
        document.getElementById("team-edit-form")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          await requestJSON(`/api/teams/${selectedTeam.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name: document.getElementById("team-edit-name").value })
          });
          resetDirectoryRoute(state, "teams");
          await refresh();
        });
        document.getElementById("team-delete-button")?.addEventListener("click", async () => {
          if (!window.confirm(`Delete team "${selectedTeam.name}"? This only works when it has no active memberships.`)) return;
          await requestJSON(`/api/teams/${selectedTeam.id}`, { method: "DELETE" });
          resetDirectoryRoute(state, "teams");
          await refresh();
        });
      } else {
        setPanels([{
          span: "span-12",
          title: "Team Directory",
          copy: "Browse teams first, then branch into separate create or edit screens.",
          html: `
            ${sectionToolbar("Teams", [actionButton("Create team", "primary", `data-action="teams-create-view"`)] )}
            ${denseTable(
              ["Team", "Members", "Actions"],
              snapshot.teams.map((team) => {
                const memberCount = snapshot.memberships.filter((membership) => membership.teamID === team.id).length;
                return [
                  escapeHTML(team.name),
                  escapeHTML(`${memberCount} memberships`),
                  actionsMarkup([
                    actionButton("Edit", "secondary", `data-action="teams-edit-view" data-team-id="${team.id}"`),
                    actionButton("Delete", "danger", `data-action="teams-delete" data-team-id="${team.id}" data-team-name="${escapeHTML(team.name)}"`)
                  ])
                ];
              })
            )}
          `
        }]);
      }

      document.getElementById("view-content")?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "teams-create-view") {
          setDirectoryRoute(state, "teams", "create");
          await refresh();
        }
        if (button.dataset.action === "teams-edit-view") {
          setDirectoryRoute(state, "teams", "edit", { teamID: button.dataset.teamId });
          await refresh();
        }
        if (button.dataset.action === "teams-back") {
          resetDirectoryRoute(state, "teams");
          await refresh();
        }
        if (button.dataset.action === "teams-delete") {
          if (!window.confirm(`Delete team "${button.dataset.teamName}"? This only works when it has no active memberships.`)) return;
          await requestJSON(`/api/teams/${button.dataset.teamId}`, { method: "DELETE" });
          resetDirectoryRoute(state, "teams");
          await refresh();
        }
      }, { once: true });
      return;
    }

    if (state.currentView === "users") {
      setMetrics([]);
      const route = getDirectoryRoute(state, "users");
      const selectedUser = route.userID ? snapshot.users.find((user) => user.id === route.userID) : null;
      setHeader("People", "Manage the people directory through separate list, create, and edit screens.", `${snapshot.users.length} users`);

      if (route.mode === "create") {
        setPanels([{
          span: "span-12",
          title: "Create User",
          copy: "Create a person record in a dedicated form view.",
          html: `
            ${sectionToolbar("Person details", [actionButton("Back to list", "secondary", `data-action="users-back"`)] )}
            <form id="user-create-form" class="surface-stack">
              <input id="user-first-name" class="shell-input" placeholder="First name" required>
              <input id="user-last-name" class="shell-input" placeholder="Last name" required>
              <input id="user-nickname" class="shell-input" placeholder="Nickname (optional)">
              <input id="user-email" class="shell-input" type="email" placeholder="Email" required>
              <input id="user-department" class="shell-input" placeholder="Department">
              <input id="user-title" class="shell-input" placeholder="Role / title">
              <input id="user-avatar" class="shell-input" type="file" accept="image/*">
              <select id="user-manager" class="shell-select">${managerOptions(snapshot.users)}</select>
              <select id="user-team" class="shell-select">${optionMarkup(snapshot.teams, (team) => team.id, (team) => team.name)}</select>
              <select id="user-status" class="shell-select">
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
              <select id="user-role" class="shell-select">
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="manager">manager</option>
                <option value="member" selected>member</option>
                <option value="guest">guest</option>
              </select>
              <div class="inline-actions">
                <button class="shell-button" type="submit">Create user</button>
              </div>
            </form>
          `
        }]);
        document.getElementById("user-create-form")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          const avatarDataURL = await selectedAvatarDataURL("user-avatar");
          await requestJSON("/api/users", {
            method: "POST",
            body: JSON.stringify({
              firstName: document.getElementById("user-first-name").value,
              lastName: document.getElementById("user-last-name").value,
              nickname: document.getElementById("user-nickname").value,
              email: document.getElementById("user-email").value,
              department: document.getElementById("user-department").value,
              title: document.getElementById("user-title").value,
              avatarDataURL,
              managerUserID: document.getElementById("user-manager").value || null,
              teamID: document.getElementById("user-team").value,
              status: document.getElementById("user-status").value,
              role: document.getElementById("user-role").value
            })
          });
          resetDirectoryRoute(state, "users");
          await refresh();
        });
      } else if (route.mode === "edit" && selectedUser) {
        setPanels([{
          span: "span-12",
          title: "Edit User",
          copy: "Update one account at a time from a dedicated edit screen.",
          html: `
            ${sectionToolbar(userFullName(selectedUser), [actionButton("Back to list", "secondary", `data-action="users-back"`)] )}
            <form id="user-edit-form" class="surface-stack">
              <input id="user-edit-first-name" class="shell-input" value="${escapeHTML(selectedUser.firstName || "")}" required>
              <input id="user-edit-last-name" class="shell-input" value="${escapeHTML(selectedUser.lastName || "")}" required>
              <input id="user-edit-nickname" class="shell-input" value="${escapeHTML(selectedUser.nickname || "")}" placeholder="Nickname (optional)">
              <input id="user-edit-email" class="shell-input" type="email" value="${escapeHTML(selectedUser.email)}" required>
              <input id="user-edit-department" class="shell-input" value="${escapeHTML(selectedUser.department || "")}" placeholder="Department">
              <input id="user-edit-title" class="shell-input" value="${escapeHTML(selectedUser.title || "")}" placeholder="Role / title">
              <input id="user-edit-avatar" class="shell-input" type="file" accept="image/*">
              <select id="user-edit-manager" class="shell-select">${managerOptions(snapshot.users.filter((user) => user.id !== selectedUser.id), selectedUser.managerUserID || "")}</select>
              <select id="user-edit-status" class="shell-select">
                <option value="active"${selectedUser.status === "active" ? " selected" : ""}>active</option>
                <option value="suspended"${selectedUser.status === "suspended" ? " selected" : ""}>suspended</option>
              </select>
              <div class="inline-actions">
                <button class="shell-button" type="submit">Save user</button>
                <button id="user-delete-button" class="shell-button-danger" type="button">Delete user</button>
              </div>
            </form>
          `
        }]);
        document.getElementById("user-edit-form")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          const avatarDataURL = await selectedAvatarDataURL("user-edit-avatar");
          const payload = {
            firstName: document.getElementById("user-edit-first-name").value,
            lastName: document.getElementById("user-edit-last-name").value,
            nickname: document.getElementById("user-edit-nickname").value,
            email: document.getElementById("user-edit-email").value,
            department: document.getElementById("user-edit-department").value,
            title: document.getElementById("user-edit-title").value,
            managerUserID: document.getElementById("user-edit-manager").value || null,
            status: document.getElementById("user-edit-status").value
          };
          if (avatarDataURL !== undefined) payload.avatarDataURL = avatarDataURL;
          await requestJSON(`/api/users/${selectedUser.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
          resetDirectoryRoute(state, "users");
          await refresh();
        });
        document.getElementById("user-delete-button")?.addEventListener("click", async () => {
          if (!window.confirm(`Delete user "${userFullName(selectedUser)}"?`)) return;
          await requestJSON(`/api/users/${selectedUser.id}`, { method: "DELETE" });
          resetDirectoryRoute(state, "users");
          await refresh();
        });
      } else {
        setPanels([{
          span: "span-12",
          title: "People Directory",
          copy: "Browse the directory first, then branch into create or edit screens.",
          html: `
            ${sectionToolbar("People", [actionButton("Create user", "primary", `data-action="users-create-view"`)] )}
            ${denseTable(
              ["User", "Profile", "State", "Actions"],
              snapshot.users.map((user) => {
                const presenceState = presence.find((item) => item.userID === user.id)?.isOnline ? "online" : "offline";
                const manager = snapshot.users.find((item) => item.id === user.managerUserID);
                return [
                  `<strong>${userRef(user)}</strong><span class="dense-sub">${escapeHTML(user.email)}</span>`,
                  `${escapeHTML((user.department || "No department"))}<span class="dense-sub">${escapeHTML(user.title || "No title")} · ${manager ? userRef(manager) : escapeHTML("No manager")}</span>`,
                  `<span class="status-pill">${escapeHTML(user.status)}</span><span class="dense-sub">${escapeHTML(presenceState)}</span>`,
                  actionsMarkup([
                    actionButton("Edit", "secondary", `data-action="users-edit-view" data-user-id="${user.id}"`),
                    actionButton("Delete", "danger", `data-action="users-delete" data-user-id="${user.id}" data-user-name="${escapeHTML(userFullName(user))}"`)
                  ])
                ];
              })
            )}
          `
        }]);
      }

      document.getElementById("view-content")?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "users-create-view") {
          setDirectoryRoute(state, "users", "create");
          await refresh();
        }
        if (button.dataset.action === "users-edit-view") {
          setDirectoryRoute(state, "users", "edit", { userID: button.dataset.userId });
          await refresh();
        }
        if (button.dataset.action === "users-back") {
          resetDirectoryRoute(state, "users");
          await refresh();
        }
        if (button.dataset.action === "users-delete") {
          if (!window.confirm(`Delete user "${button.dataset.userName}"?`)) return;
          await requestJSON(`/api/users/${button.dataset.userId}`, { method: "DELETE" });
          resetDirectoryRoute(state, "users");
          await refresh();
        }
      }, { once: true });
      return;
    }

    if (state.currentView === "structure") {
      setMetrics([]);
      state.collapsedOrgNodes ??= new Set();
      state.orgChartLayout ??= "horizontal";
      state.selectedOrgUserID ??= "user-marcin";
      state.orgTreeScroll ??= { left: 0, top: 0 };
      if (state.orgTreeCleanup) {
        state.orgTreeCleanup();
        state.orgTreeCleanup = null;
      }
      const orgRoots = buildOrgTree(snapshot);
      const branchIDs = collectBranchIDs(orgRoots);
      const managerMap = buildManagerMap(snapshot);
      const selectedPath = buildAncestorSet(managerMap, state.selectedOrgUserID);
      const managedCount = snapshot.users.filter((user) => snapshot.users.some((candidate) => candidate.managerUserID === user.id)).length;
      setHeader("Structure", "Review the current reporting tree using existing manager relationships from xGroup.", `${managedCount} managers`);
      setPanels([
        {
          span: "span-12",
          title: "Reporting Tree",
          copy: "This view maps people through manager relationships and keeps the organizational hierarchy separate from account editing.",
          html: orgRoots.length
            ? `
              <div class="org-tree-toolbar">
                <div class="org-layout-toggle">
                  <button class="org-layout-button${state.orgChartLayout === "horizontal" ? " active" : ""}" type="button" data-action="org-layout-horizontal">Horizontal</button>
                  <button class="org-layout-button${state.orgChartLayout === "vertical" ? " active" : ""}" type="button" data-action="org-layout-vertical">Vertical</button>
                </div>
                <div class="inline-actions">
                  <button class="shell-button-secondary" type="button" data-action="expand-all-org">Expand all</button>
                  <button class="shell-button-secondary" type="button" data-action="collapse-all-org">Collapse all</button>
                </div>
              </div>
              <div class="org-tree ${state.orgChartLayout === "horizontal" ? "horizontal" : "vertical"}">
                <div class="org-tree-canvas">${renderOrgTree(snapshot, orgRoots, state.collapsedOrgNodes)}</div>
              </div>
            `
            : renderEmpty("No structure", "Assign managers to users to build the reporting tree.")
        }
      ]);
      const orgTree = document.querySelector(".org-tree.horizontal");
      if (orgTree) {
        let dragState = null;
        const stopDrag = () => {
          dragState = null;
          orgTree.classList.remove("dragging");
          highlightHorizontalOrgTree(orgTree, selectedPath);
        };
        const handleTreeMouseDown = (event) => {
          if (event.button !== 0) return;
          if (
            event.target.closest("button") ||
            event.target.closest("[data-user-id]") ||
            event.target.closest(".org-card")
          ) return;
          dragState = {
            x: event.clientX,
            y: event.clientY,
            left: orgTree.scrollLeft,
            top: orgTree.scrollTop
          };
          orgTree.classList.add("dragging");
          event.preventDefault();
        };
        const handleMouseMove = (event) => {
          if (!dragState) return;
          orgTree.scrollLeft = dragState.left - (event.clientX - dragState.x);
          orgTree.scrollTop = dragState.top - (event.clientY - dragState.y);
        };
        const handleScroll = () => {
          state.orgTreeScroll = {
            left: orgTree.scrollLeft,
            top: orgTree.scrollTop
          };
          highlightHorizontalOrgTree(orgTree, selectedPath);
        };
        const handleSelectMouseDown = async (event) => {
          if (event.button !== 0) return;
          if (event.target.closest("button")) return;
          const card = event.target.closest('[data-action="select-org-user"]');
          if (!card) return;
          state.orgTreeScroll = {
            left: orgTree.scrollLeft,
            top: orgTree.scrollTop
          };
          state.selectedOrgUserID = card.dataset.userId;
          await refresh();
        };
        layoutHorizontalOrgTree(orgTree);
        orgTree.scrollLeft = state.orgTreeScroll.left || 0;
        orgTree.scrollTop = state.orgTreeScroll.top || 0;
        highlightHorizontalOrgTree(orgTree, selectedPath);
        orgTree.addEventListener("mousedown", handleTreeMouseDown);
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", stopDrag);
        orgTree.addEventListener("scroll", handleScroll, { passive: true });
        document.getElementById("view-content")?.addEventListener("mousedown", handleSelectMouseDown);
        window.requestAnimationFrame(() => {
          layoutHorizontalOrgTree(orgTree);
          orgTree.scrollLeft = state.orgTreeScroll.left || 0;
          orgTree.scrollTop = state.orgTreeScroll.top || 0;
          highlightHorizontalOrgTree(orgTree, selectedPath);
        });
        state.orgTreeCleanup = () => {
          orgTree.removeEventListener("mousedown", handleTreeMouseDown);
          window.removeEventListener("mousemove", handleMouseMove);
          window.removeEventListener("mouseup", stopDrag);
          orgTree.removeEventListener("scroll", handleScroll);
          document.getElementById("view-content")?.removeEventListener("mousedown", handleSelectMouseDown);
        };
      }
      document.getElementById("view-content")?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "toggle-org-node") {
          state.orgTreeScroll = {
            left: document.querySelector(".org-tree.horizontal")?.scrollLeft || 0,
            top: document.querySelector(".org-tree.horizontal")?.scrollTop || 0
          };
          const userID = button.dataset.userId;
          if (state.collapsedOrgNodes.has(userID)) {
            state.collapsedOrgNodes.delete(userID);
          } else {
            state.collapsedOrgNodes.add(userID);
          }
          await refresh();
          return;
        }
        if (button.dataset.action === "expand-all-org") {
          state.orgTreeScroll = {
            left: document.querySelector(".org-tree.horizontal")?.scrollLeft || 0,
            top: document.querySelector(".org-tree.horizontal")?.scrollTop || 0
          };
          state.collapsedOrgNodes.clear();
          await refresh();
          return;
        }
        if (button.dataset.action === "collapse-all-org") {
          state.orgTreeScroll = {
            left: document.querySelector(".org-tree.horizontal")?.scrollLeft || 0,
            top: document.querySelector(".org-tree.horizontal")?.scrollTop || 0
          };
          state.collapsedOrgNodes = new Set(branchIDs);
          await refresh();
          return;
        }
        if (button.dataset.action === "org-layout-horizontal") {
          state.orgTreeScroll = {
            left: document.querySelector(".org-tree.horizontal, .org-tree.vertical")?.scrollLeft || 0,
            top: document.querySelector(".org-tree.horizontal, .org-tree.vertical")?.scrollTop || 0
          };
          state.orgChartLayout = "horizontal";
          await refresh();
          return;
        }
        if (button.dataset.action === "org-layout-vertical") {
          state.orgTreeScroll = {
            left: document.querySelector(".org-tree.horizontal, .org-tree.vertical")?.scrollLeft || 0,
            top: document.querySelector(".org-tree.horizontal, .org-tree.vertical")?.scrollTop || 0
          };
          state.orgChartLayout = "vertical";
          await refresh();
        }
      }, { once: true });
      return;
    }

    if (state.currentView === "memberships") {
      setMetrics([]);
      const route = getDirectoryRoute(state, "memberships");
      const selectedMembership = route.membershipID
        ? snapshot.memberships.find((membership) => membershipKey(membership) === route.membershipID)
        : null;
      setHeader("Memberships", "Manage role links through separate list, create, and edit screens.", `${snapshot.memberships.length} role links`);

      if (route.mode === "create") {
        setPanels([{
          span: "span-12",
          title: "Create Membership",
          copy: "Assign a user to a team from a dedicated form screen.",
          html: `
            ${sectionToolbar("Membership details", [actionButton("Back to list", "secondary", `data-action="memberships-back"`)] )}
            <form id="membership-create-form" class="surface-stack">
              <select id="membership-user" class="shell-select">${optionMarkup(snapshot.users, (user) => user.id, (user) => user.displayName)}</select>
              <select id="membership-team" class="shell-select">${optionMarkup(snapshot.teams, (team) => team.id, (team) => team.name)}</select>
              <select id="membership-role" class="shell-select">
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="manager">manager</option>
                <option value="member" selected>member</option>
                <option value="guest">guest</option>
              </select>
              <div class="inline-actions">
                <button class="shell-button" type="submit">Add membership</button>
              </div>
            </form>
          `
        }]);
        document.getElementById("membership-create-form")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          await requestJSON("/api/memberships", {
            method: "POST",
            body: JSON.stringify({
              userID: document.getElementById("membership-user").value,
              teamID: document.getElementById("membership-team").value,
              role: document.getElementById("membership-role").value
            })
          });
          resetDirectoryRoute(state, "memberships");
          await refresh();
        });
      } else if (route.mode === "edit" && selectedMembership) {
        const membershipUser = snapshot.users.find((item) => item.id === selectedMembership.userID);
        const membershipTeam = snapshot.teams.find((item) => item.id === selectedMembership.teamID);
        setPanels([{
          span: "span-12",
          title: "Edit Membership",
          copy: "Change one role link or remove it entirely from a dedicated edit screen.",
          html: `
            ${sectionToolbar(`${membershipUser?.displayName || selectedMembership.userID} → ${membershipTeam?.name || selectedMembership.teamID}`, [actionButton("Back to list", "secondary", `data-action="memberships-back"`)] )}
            <form id="membership-edit-form" class="surface-stack">
              <select id="membership-edit-role" class="shell-select">
                <option value="owner"${selectedMembership.role === "owner" ? " selected" : ""}>owner</option>
                <option value="admin"${selectedMembership.role === "admin" ? " selected" : ""}>admin</option>
                <option value="manager"${selectedMembership.role === "manager" ? " selected" : ""}>manager</option>
                <option value="member"${selectedMembership.role === "member" ? " selected" : ""}>member</option>
                <option value="guest"${selectedMembership.role === "guest" ? " selected" : ""}>guest</option>
              </select>
              <div class="inline-actions">
                <button class="shell-button" type="submit">Save membership</button>
                <button id="membership-delete-button" class="shell-button-danger" type="button">Delete membership</button>
              </div>
            </form>
          `
        }]);
        document.getElementById("membership-edit-form")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          await requestJSON(`/api/memberships/${selectedMembership.userID}/${selectedMembership.teamID}`, {
            method: "PATCH",
            body: JSON.stringify({ role: document.getElementById("membership-edit-role").value })
          });
          resetDirectoryRoute(state, "memberships");
          await refresh();
        });
        document.getElementById("membership-delete-button")?.addEventListener("click", async () => {
          if (!window.confirm(`Delete membership "${membershipUser?.displayName || selectedMembership.userID} → ${membershipTeam?.name || selectedMembership.teamID}"?`)) return;
          await requestJSON(`/api/memberships/${selectedMembership.userID}/${selectedMembership.teamID}`, { method: "DELETE" });
          resetDirectoryRoute(state, "memberships");
          await refresh();
        });
      } else {
        setPanels([{
          span: "span-12",
          title: "Role Map",
          copy: "Browse the role inventory first, then branch into create or edit screens.",
          html: `
            ${sectionToolbar("Memberships", [actionButton("Create membership", "primary", `data-action="memberships-create-view"`)] )}
            ${denseTable(
              ["User", "Team", "Role", "Actions"],
              snapshot.memberships.map((membership) => {
                const user = snapshot.users.find((item) => item.id === membership.userID);
                const team = snapshot.teams.find((item) => item.id === membership.teamID);
                return [
                  user ? userRef(user) : escapeHTML(membership.userID),
                  escapeHTML(team?.name || membership.teamID),
                  `<span class="status-pill">${escapeHTML(membership.role)}</span>`,
                  actionsMarkup([
                    actionButton("Edit", "secondary", `data-action="memberships-edit-view" data-membership-id="${membershipKey(membership)}"`),
                    actionButton("Delete", "danger", `data-action="memberships-delete" data-user-id="${membership.userID}" data-team-id="${membership.teamID}" data-membership-name="${escapeHTML(`${user?.displayName || membership.userID} → ${team?.name || membership.teamID}`)}"`)
                  ])
                ];
              })
            )}
          `
        }]);
      }

      document.getElementById("view-content")?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "memberships-create-view") {
          setDirectoryRoute(state, "memberships", "create");
          await refresh();
        }
        if (button.dataset.action === "memberships-edit-view") {
          setDirectoryRoute(state, "memberships", "edit", { membershipID: button.dataset.membershipId });
          await refresh();
        }
        if (button.dataset.action === "memberships-back") {
          resetDirectoryRoute(state, "memberships");
          await refresh();
        }
        if (button.dataset.action === "memberships-delete") {
          if (!window.confirm(`Delete membership "${button.dataset.membershipName}"?`)) return;
          await requestJSON(`/api/memberships/${button.dataset.userId}/${button.dataset.teamId}`, { method: "DELETE" });
          resetDirectoryRoute(state, "memberships");
          await refresh();
        }
      }, { once: true });
      return;
    }

    if (state.currentView === "invitations") {
      setMetrics([]);
      const route = getDirectoryRoute(state, "invitations");
      setHeader("Invitations", "Manage invitations through a dedicated list and a separate create screen.", `${invitations.length} invitations`);

      if (route.mode === "create") {
        setPanels([{
          span: "span-12",
          title: "Create Invitation",
          copy: "Prepare a pending workspace invite without mixing it into the registry list.",
          html: `
            ${sectionToolbar("Invitation details", [actionButton("Back to list", "secondary", `data-action="invitations-back"`)] )}
            <form id="invitation-form" class="surface-stack">
              <input id="invitation-name" class="shell-input" placeholder="Display name" required>
              <input id="invitation-email" class="shell-input" type="email" placeholder="Email" required>
              <select id="invitation-team" class="shell-select">${optionMarkup(snapshot.teams, (team) => team.id, (team) => team.name)}</select>
              <select id="invitation-role" class="shell-select">
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="manager">manager</option>
                <option value="member" selected>member</option>
                <option value="guest">guest</option>
              </select>
              <div class="inline-actions">
                <button class="shell-button" type="submit">Create invitation</button>
              </div>
            </form>
          `
        }]);
        document.getElementById("invitation-form")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          await requestJSON("/api/invitations", {
            method: "POST",
            body: JSON.stringify({
              displayName: document.getElementById("invitation-name").value,
              email: document.getElementById("invitation-email").value,
              teamID: document.getElementById("invitation-team").value,
              role: document.getElementById("invitation-role").value
            })
          });
          resetDirectoryRoute(state, "invitations");
          await refresh();
        });
      } else {
        setPanels([{
          span: "span-12",
          title: "Invitations",
          copy: "List existing invitations first, then branch into create or follow-up actions.",
          html: `
            ${sectionToolbar("Invitations", [actionButton("Create invitation", "primary", `data-action="invitations-create-view"`)] )}
            ${invitations.length
              ? denseTable(["Invite", "Access", "State", "Actions"], invitations.map((invitation) => {
                  const team = snapshot.teams.find((item) => item.id === invitation.teamID);
                  const buttons = invitation.status === "pending"
                    ? [
                        actionButton("Accept", "primary", `data-action="accept-invitation" data-invitation-id="${invitation.id}"`),
                        actionButton("Revoke", "danger", `data-action="revoke-invitation" data-invitation-id="${invitation.id}"`)
                      ]
                    : [];
                  return [
                    `<strong>${escapeHTML(invitation.displayName)}</strong><span class="dense-sub">${escapeHTML(invitation.email)}</span>`,
                    escapeHTML(`${team?.name || invitation.teamID} · ${invitation.role}`),
                    `<span class="status-pill">${escapeHTML(invitation.status)}</span>`,
                    `<div class="inline-actions">${buttons.join("")}</div>`
                  ];
                }))
              : renderEmpty("No invitations", "Create an invitation to start provisioning.")}
          `
        }]);
      }

      document.getElementById("view-content")?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "invitations-create-view") {
          setDirectoryRoute(state, "invitations", "create");
          await refresh();
        }
        if (button.dataset.action === "invitations-back") {
          resetDirectoryRoute(state, "invitations");
          await refresh();
        }
        if (button.dataset.action === "accept-invitation") {
          await requestJSON(`/api/invitations/${button.dataset.invitationId}/accept`, { method: "POST", body: JSON.stringify({}) });
          resetDirectoryRoute(state, "invitations");
          await refresh();
        }
        if (button.dataset.action === "revoke-invitation") {
          if (!window.confirm("Revoke this invitation?")) return;
          await requestJSON(`/api/invitations/${button.dataset.invitationId}/revoke`, { method: "POST", body: JSON.stringify({}) });
          resetDirectoryRoute(state, "invitations");
          await refresh();
        }
      }, { once: true });
      return;
    }

    if (state.currentView === "sessions") {
      setMetrics([]);
      setHeader("Active Sessions", "Inspect live sessions and revoke them without combining this admin flow with directory editing.", `${adminSessions.length} active sessions`);
      setPanels([
        {
          span: "span-12",
          title: "Session Inventory",
          copy: "Session timestamps follow the selected timezone. The toolbar login remains in the top-right corner across every app.",
          html: adminSessions.length
            ? denseTable(["User", "Expires", "Created", "Actions"], adminSessions.map((session) => [
                `<strong>${session.user ? userRef(session.user) : escapeHTML(session.userID)}</strong><span class="dense-sub">${escapeHTML(session.user?.email || session.userID)}</span>`,
                escapeHTML(formatDateTime(session.expiresAt)),
                escapeHTML(formatDateTime(session.createdAt)),
                `<div class="inline-actions">${
                  [
                    actionButton("Revoke session", "secondary", `data-action="revoke-session" data-token="${session.token}"`),
                    actionButton("Revoke user sessions", "danger", `data-action="revoke-user-sessions" data-user-id="${session.userID}"`)
                  ].join("")
                }</div>`
              ]))
            : renderEmpty("No sessions", "Session inventory is available after an authorized sign-in.")
        }
      ]);

      document.getElementById("view-content")?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "revoke-session") {
          await requestJSON(`/api/admin/sessions/${button.dataset.token}`, { method: "DELETE" });
        }
        if (button.dataset.action === "revoke-user-sessions") {
          await requestJSON(`/api/admin/users/${button.dataset.userId}/sessions`, { method: "DELETE" });
        }
        await refresh();
      });
    }
  }
});

shell.refresh().catch((error) => {
  document.getElementById("app").innerHTML = `<pre>${shellAPI.escapeHTML(error.message)}</pre>`;
});
