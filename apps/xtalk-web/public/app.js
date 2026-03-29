const shellAPI = window.XHarborShell;

let chatStream;
let selectedThread = { kind: "room", id: null };
let shell;
let presenceTimer = null;
let presenceAutomationBound = false;
let presenceAutomationActive = false;
let currentSessionPresence = "offline";
const INACTIVITY_TIMEOUT_MS = 60_000;

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

function preferredRoomTeamID(workspace, currentUserID) {
  return workspace.memberships.find((membership) => membership.userID === currentUserID)?.teamID || "";
}

function threadItem(title, copy, unread, active, kind, id, titleClass = "", userID = "") {
  return `
    <article class="chat-thread${active ? " active" : ""}" data-thread-kind="${kind}" data-thread-id="${id}">
      <div class="chat-thread-header">
        <span class="chat-thread-title ${titleClass}"${userID ? ` data-user-id="${shellAPI.escapeHTML(userID)}"` : ""}>${shellAPI.escapeHTML(title)}</span>
        ${unread ? `<span class="chat-unread">${shellAPI.escapeHTML(String(unread))}</span>` : ""}
      </div>
      ${copy ? `<div class="chat-thread-copy">${shellAPI.escapeHTML(copy)}</div>` : ""}
    </article>
  `;
}

function messageItem(author, body, createdAt, formatDateTime, authorClass = "", authorUserID = "") {
  return `
    <article class="chat-message">
      <h4 class="${authorClass}"${authorUserID ? ` data-user-id="${shellAPI.escapeHTML(authorUserID)}"` : ""}>${shellAPI.escapeHTML(author)}</h4>
      <p>${shellAPI.escapeHTML(body)}</p>
      <time>${shellAPI.escapeHTML(formatDateTime(createdAt))}</time>
    </article>
  `;
}

shell = shellAPI.createShell({
  appName: "xTalk",
  appSubtitle: "Rooms and direct collaboration",
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
      setHeader("Chat Access", "Sign in from the navbar to use xTalk.", "Signed out");
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
      return {
        id: conversation.id,
        title: partner?.displayName || conversation.id,
        copy: "",
        titleClass: presenceClass(presenceByUserID.get(partnerID)),
        userID: partnerID,
        unread: payload.directUnread?.[conversation.id] || 0,
        conversation
      };
    });

    const roomThreads = payload.rooms.map((room) => {
      const team = payload.workspace.teams.find((item) => item.id === room.teamID);
      return {
        id: room.id,
        title: room.name,
        copy: "",
        unread: payload.roomUnread?.[room.id] || 0,
        room
      };
    });

    const availableThreads = [
      ...roomThreads.map((thread) => ({ kind: "room", ...thread })),
      ...directThreads.map((thread) => ({ kind: "direct", ...thread }))
    ];

    if (!availableThreads.some((thread) => thread.kind === selectedThread.kind && thread.id === selectedThread.id)) {
      selectedThread = availableThreads[0] ? { kind: availableThreads[0].kind, id: availableThreads[0].id } : { kind: "room", id: null };
    }

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
    const activeTitleClass = selectedThread.kind === "direct"
      ? presenceClass(presenceByUserID.get(activeDirectPartnerID))
      : "";

    setMetrics([]);
    setHeader("Chat", "Compact messenger layout: left conversation rail, right active chat.", payload.syncStatus.lastSyncSucceeded ? "Synced" : "Sync pending");
    setPanels([
      {
        span: "span-12",
        title: "Messenger",
        copy: "Settings remain in the user menu under the navbar. The main view stays focused on chat only.",
        html: `
          <div class="section-toolbar">
            <span class="muted">${escapeHTML(payload.syncStatus.lastSyncAt ? `Last sync ${formatDateTime(payload.syncStatus.lastSyncAt)}` : "No sync yet")}</span>
            <button id="refresh-button" class="shell-button-secondary" type="button">Refresh workspace</button>
          </div>
          <div class="chat-layout">
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
                    ? directThreads.map((thread) => threadItem(thread.title, thread.copy, thread.unread, selectedThread.kind === "direct" && selectedThread.id === thread.id, "direct", thread.id, thread.titleClass, thread.userID)).join("")
                    : renderEmpty("No direct conversations", "Start the first DM below.")}
                </div>
              </div>
            </aside>
            <section class="chat-main">
              ${selectedThread.id ? `
                <div class="chat-header">
                  <h3 class="${activeTitleClass}"${activeDirectPartnerID ? ` data-user-id="${escapeHTML(activeDirectPartnerID)}"` : ""}>${escapeHTML(activeTitle || "Conversation")}</h3>
                  <p>${escapeHTML(activeSubtitle || "Chat thread")}</p>
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
                          presenceClass(presenceByUserID.get(message.authorUserID)),
                          message.authorUserID
                        );
                      }).join("")
                    : renderEmpty("No messages", "Start the conversation.")}
                </div>
                <form id="message-form" class="chat-composer">
                  <textarea id="message-body" class="shell-textarea" placeholder="Write a message" required></textarea>
                  <div class="inline-actions">
                    <button class="shell-button" type="submit">Send</button>
                    <button id="mark-read-button" class="shell-button-secondary" type="button">Mark as read</button>
                  </div>
                </form>
              ` : renderEmpty("No conversation selected", "Choose a room or direct conversation from the left rail.")}
            </section>
          </div>
        `
      }
    ]);

    document.getElementById("refresh-button")?.addEventListener("click", async () => {
      await refreshWorkspace();
      await refresh();
    });

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
      const body = document.getElementById("message-body").value;
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
      await refresh();
    });

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
