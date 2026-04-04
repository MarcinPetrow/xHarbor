const shellAPI = window.XHarborShell;

let chatStream;
let selectedThread = { kind: "room", id: null };
let shell;
let presenceTimer = null;
let presenceAutomationBound = false;
let presenceAutomationActive = false;
let currentSessionPresence = "offline";
const INACTIVITY_TIMEOUT_MS = 60_000;

function readThreadFromLocation() {
  const url = new URL(window.location.href);
  const kind = url.searchParams.get("threadKind");
  const id = url.searchParams.get("threadId");
  if (!id || (kind !== "room" && kind !== "direct")) {
    return null;
  }
  return { kind, id };
}

function syncThreadLocation(thread) {
  const url = new URL(window.location.href);
  if (thread?.id) {
    url.searchParams.set("threadKind", thread.kind);
    url.searchParams.set("threadId", thread.id);
  } else {
    url.searchParams.delete("threadKind");
    url.searchParams.delete("threadId");
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

async function loadUsers() {
  return requestJSON("/api/users", { headers: {} });
}

async function loadSession() {
  return requestJSON("/api/session", { headers: {} });
}

async function loadChat() {
  return requestJSON("/api/chat", { headers: {} });
}

async function loadPresence() {
  return requestJSON("/api/presence", { headers: {} });
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

async function refreshWorkspace() {
  return requestJSON("/api/chat/refresh-workspace", {
    method: "POST",
    body: JSON.stringify({})
  });
}

async function updateSessionPresence(presence) {
  return requestJSON("/api/session/presence", {
    method: "POST",
    body: JSON.stringify({ presence })
  });
}

function stopChatStream() {
  if (chatStream) {
    chatStream.close();
    chatStream = null;
  }
}

function clearPresenceTimer() {
  if (presenceTimer) {
    window.clearTimeout(presenceTimer);
    presenceTimer = null;
  }
}

async function setPresence(presence) {
  if (!presenceAutomationActive || currentSessionPresence === presence) {
    return;
  }

  currentSessionPresence = presence;
  try {
    await updateSessionPresence(presence);
  } catch {
    // Ignore transient presence sync failures; the next interaction will retry.
  }
}

function scheduleBRB() {
  clearPresenceTimer();
  if (!presenceAutomationActive) return;
  presenceTimer = window.setTimeout(() => {
    setPresence("brb");
  }, INACTIVITY_TIMEOUT_MS);
}

function handleUserActivity() {
  if (!presenceAutomationActive) return;
  scheduleBRB();
  setPresence("online");
}

function bindPresenceAutomation() {
  if (presenceAutomationBound) return;
  ["pointerdown", "keydown", "mousemove", "scroll", "touchstart", "focus"].forEach((eventName) => {
    window.addEventListener(eventName, handleUserActivity, { passive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (!presenceAutomationActive) return;
    if (document.visibilityState === "visible") {
      handleUserActivity();
    }
  });
  presenceAutomationBound = true;
}

function startPresenceAutomation() {
  bindPresenceAutomation();
  presenceAutomationActive = true;
  handleUserActivity();
}

function stopPresenceAutomation() {
  presenceAutomationActive = false;
  currentSessionPresence = "offline";
  clearPresenceTimer();
}

function startChatStream() {
  stopChatStream();
  chatStream = new EventSource("/api/chat/stream");
  const rerender = () => shell?.refresh().catch(() => {});
  [
    "xtalk.room.created",
    "xtalk.room.message.created",
    "xtalk.room.read",
    "xtalk.room.archived",
    "xtalk.room.restored",
    "xtalk.direct.created",
    "xtalk.direct.message.created",
    "xtalk.direct.read",
    "xtalk.workspace.synced"
  ].forEach((eventName) => chatStream.addEventListener(eventName, rerender));
  chatStream.onerror = () => {
    stopChatStream();
    window.setTimeout(() => {
      loadSession()
        .then((session) => {
          if (session.authenticated) startChatStream();
        })
        .catch(() => {});
    }, 1500);
  };
}

function presenceClass(presence) {
  if (presence === "online") return "presence-online";
  if (presence === "brb") return "presence-brb";
  return "presence-offline";
}

function presenceDot(presence) {
  return `<span class="presence-dot ${presenceClass(presence)}" aria-hidden="true"></span>`;
}

function preferredRoomTeamID(workspace, currentUserID) {
  return workspace.memberships.find((membership) => membership.userID === currentUserID)?.teamID || "";
}

function initials(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function threadItem(title, copy, unread, active, kind, id, presence = "", userID = "") {
  return `
    <article class="chat-thread${active ? " active" : ""}" data-thread-kind="${kind}" data-thread-id="${id}">
      <div class="chat-thread-body">
        <span class="chat-thread-avatar">${shellAPI.escapeHTML(initials(title))}</span>
        <div class="chat-thread-meta">
          <span class="chat-thread-title"${userID ? ` data-user-id="${shellAPI.escapeHTML(userID)}"` : ""}>${shellAPI.escapeHTML(title)}${presence ? presenceDot(presence) : ""}</span>
          ${copy ? `<span class="chat-thread-copy">${shellAPI.escapeHTML(copy)}</span>` : ""}
        </div>
        ${unread ? `<span class="chat-unread">${shellAPI.escapeHTML(String(unread))}</span>` : ""}
      </div>
    </article>
  `;
}

function messageItem(author, body, createdAt, formatDateTime, authorPresence = "", authorUserID = "", own = false) {
  return `
    <article class="chat-message${own ? " own" : ""}">
      <div class="chat-message-glow"></div>
      <div class="chat-message-shell">
        <h4${authorUserID ? ` data-user-id="${shellAPI.escapeHTML(authorUserID)}"` : ""}>${shellAPI.escapeHTML(author)}${authorPresence ? presenceDot(authorPresence) : ""}</h4>
        <p>${shellAPI.renderTagText(body)}</p>
        <time>${shellAPI.escapeHTML(formatDateTime(createdAt))}</time>
      </div>
    </article>
  `;
}

shell = shellAPI.createShell({
  appName: "xTalk",
  appSubtitle: "Rooms and direct collaboration",
  shellClassName: "shell-compact",
  defaultView: "chat",
  navigation: [
    {
      section: "Communication",
      items: [
        { id: "chat", label: "Chat", copy: "Compact conversation layout." }
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
  onLogin: async (userID) => {
    const result = await createSession(userID);
    startChatStream();
    startPresenceAutomation();
    return result;
  },
  onLogout: async () => {
    stopChatStream();
    stopPresenceAutomation();
    return destroySession();
  },
  renderView: async ({ state, setHeader, setMetrics, setPanels, renderEmpty, dataCard, escapeHTML, formatDateTime, refresh }) => {
    if (!state.session.authenticated) {
      stopChatStream();
      stopPresenceAutomation();
      setHeader("", "", "", { hidden: true });
      setMetrics([]);
      setPanels([
        {
          span: "span-12",
          title: "Locked",
          copy: "xTalk uses the shared xGroup session authority.",
          html: renderEmpty("Sign in required", "Use the login controls in the navbar.")
        }
      ]);
      return;
    }

    if (!chatStream) {
      startChatStream();
    }

    if (!presenceAutomationActive) {
      startPresenceAutomation();
    }

    const [payload, presence] = await Promise.all([loadChat(), loadPresence()]);
    const roomTeamID = preferredRoomTeamID(payload.workspace, state.session.user.id);
    const presenceByUserID = new Map(presence.map((item) => [item.userID, item.presence || (item.isOnline ? "online" : "offline")]));
    const directThreads = payload.directConversations.map((conversation) => {
      const partnerID = conversation.participantUserIDs.find((id) => id !== state.session.user.id);
      const partner = payload.workspace.users.find((user) => user.id === partnerID);
      const partnerPresence = presenceByUserID.get(partnerID) || "offline";
      return {
        id: conversation.id,
        title: partner?.displayName || conversation.id,
        copy: partnerPresence === "online" ? "Online now" : partnerPresence === "brb" ? "BRB" : "Offline",
        presence: partnerPresence,
        userID: partnerID,
        unread: payload.directUnread?.[conversation.id] || 0,
        conversation
      };
    });

    const roomThreads = payload.rooms.map((room) => ({
      id: room.id,
      title: room.name,
      copy: "",
      unread: payload.roomUnread?.[room.id] || 0,
      room
    }));

    const availableThreads = [
      ...roomThreads.map((thread) => ({ kind: "room", ...thread })),
      ...directThreads.map((thread) => ({ kind: "direct", ...thread }))
    ];

    const locationThread = readThreadFromLocation();
    if (locationThread && availableThreads.some((thread) => thread.kind === locationThread.kind && thread.id === locationThread.id)) {
      selectedThread = locationThread;
    }

    if (!availableThreads.some((thread) => thread.kind === selectedThread.kind && thread.id === selectedThread.id)) {
      selectedThread = availableThreads[0] ? { kind: availableThreads[0].kind, id: availableThreads[0].id } : { kind: "room", id: null };
    }

    syncThreadLocation(selectedThread);

    const activeRoom = selectedThread.kind === "room" ? payload.rooms.find((room) => room.id === selectedThread.id) : null;
    const activeDirect = selectedThread.kind === "direct" ? payload.directConversations.find((conversation) => conversation.id === selectedThread.id) : null;
    const activeMessages = selectedThread.kind === "room"
      ? payload.roomMessages.filter((message) => message.conversationID === selectedThread.id)
      : payload.directMessages.filter((message) => message.conversationID === selectedThread.id);
    const activeTitle = selectedThread.kind === "room"
      ? activeRoom?.name
      : directThreads.find((thread) => thread.id === selectedThread.id)?.title;
    const activeSubtitle = selectedThread.kind === "room"
      ? payload.workspace.teams.find((team) => team.id === activeRoom?.teamID)?.name || ""
      : "Private conversation";
    const activeDirectPartnerID = activeDirect?.participantUserIDs.find((id) => id !== state.session.user.id);
    const activeDirectPresence = selectedThread.kind === "direct"
      ? presenceByUserID.get(activeDirectPartnerID)
      : "";
    const activeMembers = selectedThread.kind === "room"
      ? payload.workspace.memberships
          .filter((membership) => membership.teamID === activeRoom?.teamID)
          .map((membership) => payload.workspace.users.find((user) => user.id === membership.userID))
          .filter(Boolean)
      : payload.workspace.users.filter((user) => activeDirect?.participantUserIDs.includes(user.id));

    setMetrics([]);
    setHeader("", "", "", { hidden: true });
    setPanels([
      {
        span: "span-12",
        className: "panel-bare",
        html: `
          <div class="chat-layout chat-neon-surface">
            <aside class="chat-sidebar">
              <div class="chat-mini-section">
                <div class="chat-section-heading">
                  <strong>Rooms</strong>
                  <button id="open-room-composer" class="chat-icon-button" type="button" aria-label="Create room">+</button>
                </div>
                <form id="room-form" class="compact-stack chat-inline-form hidden">
                  <input id="room-name" class="shell-input" placeholder="New room" required>
                  <button class="shell-button-secondary" type="submit"${roomTeamID ? "" : " disabled"}>Create room</button>
                </form>
                <div id="room-thread-list" class="chat-thread-list">
                  ${roomThreads.length
                    ? roomThreads.map((thread) => threadItem(thread.title, thread.copy, thread.unread, selectedThread.kind === "room" && selectedThread.id === thread.id, "room", thread.id)).join("")
                    : renderEmpty("No rooms", "Create the first team room.")}
                </div>
              </div>
              <div class="chat-mini-section">
                <div class="chat-section-heading">
                  <strong>Direct Messages</strong>
                  <button id="open-dm-composer" class="chat-icon-button" type="button" aria-label="Open direct message">+</button>
                </div>
                <form id="dm-form" class="compact-stack chat-inline-form hidden">
                  <select id="dm-user" class="shell-select">
                    ${payload.workspace.users
                      .filter((user) => user.id !== state.session.user.id && user.status === "active")
                      .map((user) => `<option value="${escapeHTML(user.id)}">${escapeHTML(user.displayName)}</option>`).join("")}
                  </select>
                  <button class="shell-button-secondary" type="submit">Open DM</button>
                </form>
                <div id="direct-thread-list" class="chat-thread-list">
                  ${directThreads.length
                    ? directThreads.map((thread) => threadItem(thread.title, thread.copy, thread.unread, selectedThread.kind === "direct" && selectedThread.id === thread.id, "direct", thread.id, thread.presence, thread.userID)).join("")
                    : renderEmpty("No direct conversations", "Start the first DM below.")}
                </div>
              </div>
            </aside>
            <section class="chat-main">
              ${selectedThread.id ? `
                <div class="chat-header">
                  <div>
                    <h3${activeDirectPartnerID ? ` data-user-id="${escapeHTML(activeDirectPartnerID)}"` : ""}>${escapeHTML(activeTitle || "Conversation")}${activeDirectPresence ? presenceDot(activeDirectPresence) : ""}</h3>
                    <p>${escapeHTML(activeSubtitle || "Chat thread")}</p>
                  </div>
                  <button id="mark-read-button" class="chat-header-action" type="button">Mark as read</button>
                </div>
                <div class="chat-timeline">
                  ${activeMessages.length
                    ? activeMessages.map((message) => {
                        const author = payload.workspace.users.find((user) => user.id === message.authorUserID);
                        return messageItem(
                          author?.displayName || message.authorUserID,
                          message.body,
                          message.createdAt,
                          formatDateTime,
                          presenceByUserID.get(message.authorUserID),
                          message.authorUserID,
                          message.authorUserID === state.session.user.id
                        );
                      }).join("")
                    : renderEmpty("No messages", "Start the conversation.")}
                </div>
                <form id="message-form" class="chat-composer">
                  <textarea id="message-body" class="shell-textarea chat-composer-input" placeholder="Write a message" required></textarea>
                  <div class="inline-actions">
                    <button class="shell-button chat-send-button" type="submit">Send</button>
                  </div>
                </form>
              ` : renderEmpty("No conversation selected", "Choose a room or direct conversation from the left rail.")}
            </section>
            <aside class="chat-insights">
              <article class="chat-insight-card chat-insight-hero">
                <span class="chat-insight-label">Active thread</span>
                <strong>${escapeHTML(activeTitle || "No selection")}</strong>
                <p>${escapeHTML(selectedThread.kind === "room" ? "Room conversation" : selectedThread.kind === "direct" ? "Direct conversation" : "Select a conversation")}</p>
              </article>
              <article class="chat-insight-card chat-insight-members">
                <span class="chat-insight-label">Participants</span>
                <div class="chat-member-list">
                  ${activeMembers.length
                    ? activeMembers.map((user) => `
                      <div class="chat-member-row">
                        <span class="chat-member-avatar">${escapeHTML(initials(user.displayName))}</span>
                        <span data-user-id="${escapeHTML(user.id)}">${escapeHTML(user.displayName)}${presenceDot(presenceByUserID.get(user.id))}</span>
                      </div>
                    `).join("")
                    : `<span class="muted">No participants to show.</span>`}
                </div>
              </article>
              <article class="chat-insight-card chat-insight-archived">
                <span class="chat-insight-label">Archived rooms</span>
                <div class="chat-archived-list">
                  ${payload.archivedRooms?.length
                    ? payload.archivedRooms.slice(0, 4).map((room) => `<div class="chat-archived-item">${escapeHTML(room.name)}</div>`).join("")
                    : `<span class="muted">No archived rooms.</span>`}
                </div>
              </article>
            </aside>
          </div>
        `
      }
    ]);

    document.querySelectorAll("[data-thread-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        selectedThread = { kind: node.dataset.threadKind, id: node.dataset.threadId };
        await refresh();
      });
    });

    document.getElementById("open-room-composer")?.addEventListener("click", () => {
      document.getElementById("room-form")?.classList.toggle("hidden");
    });

    document.getElementById("open-dm-composer")?.addEventListener("click", () => {
      document.getElementById("dm-form")?.classList.toggle("hidden");
    });

    document.getElementById("room-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const room = await requestJSON("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("room-name").value,
          teamID: roomTeamID
        })
      });
      selectedThread = { kind: "room", id: room.id };
      await refresh();
    });

    document.getElementById("dm-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const conversation = await requestJSON("/api/direct-conversations", {
        method: "POST",
        body: JSON.stringify({ participantUserID: document.getElementById("dm-user").value })
      });
      selectedThread = { kind: "direct", id: conversation.id };
      await refresh();
    });

    document.getElementById("message-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const bodyField = document.getElementById("message-body");
      const body = bodyField.value;
      if (selectedThread.kind === "room") {
        await requestJSON(`/api/rooms/${selectedThread.id}/messages`, {
          method: "POST",
          body: JSON.stringify({ body })
        });
      } else {
        await requestJSON(`/api/direct-conversations/${selectedThread.id}/messages`, {
          method: "POST",
          body: JSON.stringify({ body })
        });
      }
      bodyField.value = "";
      await refresh();
    });

    shellAPI.attachTagAutocomplete(document.getElementById("message-body"));

    document.getElementById("mark-read-button")?.addEventListener("click", async () => {
      if (!selectedThread.id) return;
      if (selectedThread.kind === "room") {
        await requestJSON(`/api/rooms/${selectedThread.id}/read`, { method: "POST", body: JSON.stringify({}) });
      } else {
        await requestJSON(`/api/direct-conversations/${selectedThread.id}/read`, { method: "POST", body: JSON.stringify({}) });
      }
      await refresh();
    });
  }
});

shell.refresh().catch((error) => {
  document.getElementById("app").innerHTML = `<pre>${shellAPI.escapeHTML(error.message)}</pre>`;
});
