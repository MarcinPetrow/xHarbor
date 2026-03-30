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
  if (!user) return shellAPI.escapeHTML(fallback);
  return `<span data-user-id="${shellAPI.escapeHTML(user.id)}">${shellAPI.escapeHTML(user.displayName)}</span>`;
}

function rowItem(title, subtitle, meta = "", actions = "") {
  return `
    <article class="row-item${actions ? "" : " two-col"}">
      <div class="row-main">
        <span class="row-title">${shellAPI.escapeHTML(title)}</span>
        <span class="row-subtitle">${shellAPI.escapeHTML(subtitle)}</span>
      </div>
      ${meta ? `<div class="row-meta">${shellAPI.escapeHTML(meta)}</div>` : ""}
      ${actions ? `<div class="row-actions">${actions}</div>` : ""}
    </article>
  `;
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

async function loadWorkspace() {
  return requestJSON("/api/workspace", { headers: {} });
}

async function loadSession() {
  return requestJSON("/api/session", { headers: {} });
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
  loadSession,
  onLogin: createSession,
  onLogout: destroySession,
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
      setHeader("Teams", "Manage workspace teams with dedicated creation, rename, and deletion flows instead of a single crowded canvas.", `${snapshot.teams.length} teams`);
      const selectedTeam = snapshot.teams[0];

      setPanels([
        {
          span: "span-5",
          title: "Create Team",
          copy: "Add a new delivery group to the organization.",
          html: `
            <form id="team-create-form" class="surface-stack">
              <input id="team-name" class="shell-input" placeholder="Team name" required>
              <button class="shell-button" type="submit">Create team</button>
            </form>
          `
        },
        {
          span: "span-7",
          title: "Update Team",
          copy: "Rename or remove a selected team.",
          html: selectedTeam ? `
            <form id="team-edit-form" class="surface-stack">
              <select id="team-edit-id" class="shell-select">${optionMarkup(snapshot.teams, (team) => team.id, (team) => team.name, selectedTeam.id)}</select>
              <input id="team-edit-name" class="shell-input" value="${escapeHTML(selectedTeam.name)}" required>
              <div class="inline-actions">
                <button class="shell-button" type="submit">Save team</button>
                <button id="team-delete-button" class="shell-button-danger" type="button">Delete team</button>
              </div>
            </form>
          ` : renderEmpty("No teams", "Create the first team to unlock editing.")
        },
        {
          span: "span-12",
          title: "Team Directory",
          copy: "Every team is displayed as a focused card instead of sharing a single screen with forms and session inventory.",
          html: denseTable(
            ["Team", "Members"],
            snapshot.teams.map((team) => {
              const memberCount = snapshot.memberships.filter((membership) => membership.teamID === team.id).length;
              return [escapeHTML(team.name), escapeHTML(`${memberCount} memberships`)];
            })
          )
        }
      ]);

      document.getElementById("team-create-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await requestJSON("/api/teams", { method: "POST", body: JSON.stringify({ name: document.getElementById("team-name").value }) });
        await refresh();
      });

      document.getElementById("team-edit-id")?.addEventListener("change", async (event) => {
        const team = snapshot.teams.find((item) => item.id === event.target.value);
        if (team) document.getElementById("team-edit-name").value = team.name;
      });

      document.getElementById("team-edit-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await requestJSON(`/api/teams/${document.getElementById("team-edit-id").value}`, {
          method: "PATCH",
          body: JSON.stringify({ name: document.getElementById("team-edit-name").value })
        });
        await refresh();
      });

      document.getElementById("team-delete-button")?.addEventListener("click", async () => {
        await requestJSON(`/api/teams/${document.getElementById("team-edit-id").value}`, { method: "DELETE" });
        await refresh();
      });
      return;
    }

    if (state.currentView === "users") {
      setMetrics([]);
      const selectedUser = snapshot.users[0];
      setHeader("People", "Provision accounts, control suspension, and keep user data separate from team administration.", `${snapshot.users.length} users`);
      setPanels([
        {
          span: "span-5",
          title: "Create User",
          copy: "Create a user and place them into an initial team role.",
          html: `
            <form id="user-create-form" class="surface-stack">
              <input id="user-first-name" class="shell-input" placeholder="First name" required>
              <input id="user-last-name" class="shell-input" placeholder="Last name" required>
              <input id="user-nickname" class="shell-input" placeholder="Nickname (optional)">
              <input id="user-email" class="shell-input" type="email" placeholder="Email" required>
              <input id="user-department" class="shell-input" placeholder="Department">
              <input id="user-title" class="shell-input" placeholder="Role / title">
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
              <button class="shell-button" type="submit">Create user</button>
            </form>
          `
        },
        {
          span: "span-7",
          title: "Update User",
          copy: "Modify identity data and account status without mixing it into the list view.",
          html: selectedUser ? `
            <form id="user-edit-form" class="surface-stack">
              <select id="user-edit-id" class="shell-select">${optionMarkup(snapshot.users, (user) => user.id, (user) => user.displayName, selectedUser.id)}</select>
              <input id="user-edit-first-name" class="shell-input" value="${escapeHTML(selectedUser.firstName || "")}" required>
              <input id="user-edit-last-name" class="shell-input" value="${escapeHTML(selectedUser.lastName || "")}" required>
              <input id="user-edit-nickname" class="shell-input" value="${escapeHTML(selectedUser.nickname || "")}" placeholder="Nickname (optional)">
              <input id="user-edit-email" class="shell-input" type="email" value="${escapeHTML(selectedUser.email)}" required>
              <input id="user-edit-department" class="shell-input" value="${escapeHTML(selectedUser.department || "")}" placeholder="Department">
              <input id="user-edit-title" class="shell-input" value="${escapeHTML(selectedUser.title || "")}" placeholder="Role / title">
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
          ` : renderEmpty("No users", "Create the first user to unlock editing.")
        },
        {
          span: "span-12",
          title: "Account Registry",
          copy: "Presence and suspension status remain visible but no longer compete with editing forms in the same viewport.",
          html: denseTable(
            ["User", "Profile", "State"],
            snapshot.users.map((user) => {
              const presenceState = presence.find((item) => item.userID === user.id)?.isOnline ? "online" : "offline";
              const manager = snapshot.users.find((item) => item.id === user.managerUserID);
              return [
                `<strong>${userRef(user)}</strong><span class="dense-sub">${escapeHTML(user.email)}</span>`,
                `${escapeHTML((user.department || "No department"))}<span class="dense-sub">${escapeHTML(user.title || "No title")} · ${manager ? userRef(manager) : escapeHTML("No manager")}</span>`,
                `<span class="status-pill">${escapeHTML(user.status)}</span><span class="dense-sub">${escapeHTML(presenceState)}</span>`
              ];
            })
          )
        }
      ]);

      document.getElementById("user-create-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await requestJSON("/api/users", {
          method: "POST",
          body: JSON.stringify({
            firstName: document.getElementById("user-first-name").value,
            lastName: document.getElementById("user-last-name").value,
            nickname: document.getElementById("user-nickname").value,
            email: document.getElementById("user-email").value,
            department: document.getElementById("user-department").value,
            title: document.getElementById("user-title").value,
            managerUserID: document.getElementById("user-manager").value || null,
            teamID: document.getElementById("user-team").value,
            status: document.getElementById("user-status").value,
            role: document.getElementById("user-role").value
          })
        });
        await refresh();
      });

      document.getElementById("user-edit-id")?.addEventListener("change", async (event) => {
        const user = snapshot.users.find((item) => item.id === event.target.value);
        if (!user) return;
        document.getElementById("user-edit-first-name").value = user.firstName || "";
        document.getElementById("user-edit-last-name").value = user.lastName || "";
        document.getElementById("user-edit-nickname").value = user.nickname || "";
        document.getElementById("user-edit-email").value = user.email;
        document.getElementById("user-edit-department").value = user.department || "";
        document.getElementById("user-edit-title").value = user.title || "";
        document.getElementById("user-edit-manager").innerHTML = managerOptions(snapshot.users.filter((item) => item.id !== user.id), user.managerUserID || "");
        document.getElementById("user-edit-status").value = user.status;
      });

      document.getElementById("user-edit-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await requestJSON(`/api/users/${document.getElementById("user-edit-id").value}`, {
          method: "PATCH",
          body: JSON.stringify({
            firstName: document.getElementById("user-edit-first-name").value,
            lastName: document.getElementById("user-edit-last-name").value,
            nickname: document.getElementById("user-edit-nickname").value,
            email: document.getElementById("user-edit-email").value,
            department: document.getElementById("user-edit-department").value,
            title: document.getElementById("user-edit-title").value,
            managerUserID: document.getElementById("user-edit-manager").value || null,
            status: document.getElementById("user-edit-status").value
          })
        });
        await refresh();
      });

      document.getElementById("user-delete-button")?.addEventListener("click", async () => {
        await requestJSON(`/api/users/${document.getElementById("user-edit-id").value}`, { method: "DELETE" });
        await refresh();
      });
      return;
    }

    if (state.currentView === "memberships") {
      setMetrics([]);
      const selectedMembership = snapshot.memberships[0];
      setHeader("Memberships", "Attach users to teams with explicit roles and edit those links in a dedicated workspace.", `${snapshot.memberships.length} role links`);
      setPanels([
        {
          span: "span-5",
          title: "Create Membership",
          copy: "Assign a user to an additional team role.",
          html: `
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
              <button class="shell-button" type="submit">Add membership</button>
            </form>
          `
        },
        {
          span: "span-7",
          title: "Update Membership",
          copy: "Change the role for one team link or remove it entirely.",
          html: selectedMembership ? `
            <form id="membership-edit-form" class="surface-stack">
              <select id="membership-edit-id" class="shell-select">${optionMarkup(snapshot.memberships, (membership) => membershipKey(membership), (membership) => {
                const user = snapshot.users.find((item) => item.id === membership.userID);
                const team = snapshot.teams.find((item) => item.id === membership.teamID);
                return `${user?.displayName || membership.userID} → ${team?.name || membership.teamID}`;
              }, membershipKey(selectedMembership))}</select>
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
          ` : renderEmpty("No memberships", "Create a membership to unlock editing.")
        },
        {
          span: "span-12",
          title: "Role Map",
          copy: "A clean role inventory for every user-to-team relation.",
          html: denseTable(
            ["User", "Team", "Role"],
            snapshot.memberships.map((membership) => {
              const user = snapshot.users.find((item) => item.id === membership.userID);
              const team = snapshot.teams.find((item) => item.id === membership.teamID);
              return [
                user ? userRef(user) : escapeHTML(membership.userID),
                escapeHTML(team?.name || membership.teamID),
                `<span class="status-pill">${escapeHTML(membership.role)}</span>`
              ];
            })
          )
        }
      ]);

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
        await refresh();
      });

      document.getElementById("membership-edit-id")?.addEventListener("change", async (event) => {
        const membership = snapshot.memberships.find((item) => membershipKey(item) === event.target.value);
        if (membership) document.getElementById("membership-edit-role").value = membership.role;
      });

      document.getElementById("membership-edit-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const { userID, teamID } = parseMembershipKey(document.getElementById("membership-edit-id").value);
        await requestJSON(`/api/memberships/${userID}/${teamID}`, {
          method: "PATCH",
          body: JSON.stringify({ role: document.getElementById("membership-edit-role").value })
        });
        await refresh();
      });

      document.getElementById("membership-delete-button")?.addEventListener("click", async () => {
        const { userID, teamID } = parseMembershipKey(document.getElementById("membership-edit-id").value);
        await requestJSON(`/api/memberships/${userID}/${teamID}`, { method: "DELETE" });
        await refresh();
      });
      return;
    }

    if (state.currentView === "invitations") {
      setMetrics([]);
      setHeader("Invitations", "Provision new people into the workspace through an invite flow that is isolated from the live directory.", `${invitations.length} invitations`);
      setPanels([
        {
          span: "span-5",
          title: "Create Invitation",
          copy: "Prepare a pending workspace invite with an initial role.",
          html: `
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
              <button class="shell-button" type="submit">Create invitation</button>
            </form>
          `
        },
        {
          span: "span-7",
          title: "Pending and Accepted Invites",
          copy: "Accept or revoke invitations without mixing them into the user registry screen.",
          html: invitations.length
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
            : renderEmpty("No invitations", "Create an invitation to start provisioning.")
        }
      ]);

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
        await refresh();
      });

      document.getElementById("view-content")?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "accept-invitation") {
          await requestJSON(`/api/invitations/${button.dataset.invitationId}/accept`, { method: "POST", body: JSON.stringify({}) });
        }
        if (button.dataset.action === "revoke-invitation") {
          await requestJSON(`/api/invitations/${button.dataset.invitationId}/revoke`, { method: "POST", body: JSON.stringify({}) });
        }
        await refresh();
      });
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
