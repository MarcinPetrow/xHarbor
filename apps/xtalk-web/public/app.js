const shellAPI = window.XHarborShell;

let chatStream;
let selectedThread = { kind: "room", id: null };
let shell;
let presenceTimer = null;
let presenceAutomationBound = false;
let presenceAutomationActive = false;
let currentSessionPresence = "offline";
const INACTIVITY_TIMEOUT_MS = 60_000;
let forceScrollToBottom = false;
let focusComposerAfterRefresh = false;
let keepComposerFocusCycles = 0;
let lastRenderedThreadKey = "";
let lastRenderedMessageKey = "";
let chatStickToBottom = true;

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

function threadItem(title, copy, unread, active, kind, id, presence = "", userID = "", avatarEntity = null) {
  return `
    <article class="chat-thread${active ? " active" : ""}" data-thread-kind="${kind}" data-thread-id="${id}">
      <div class="chat-thread-body">
        ${shellAPI.renderAvatar(avatarEntity || { id, displayName: title }, "chat-thread-avatar")}
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

function sameCalendarDay(a, b) {
  const left = new Date(a);
  const right = new Date(b);
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function withinGroupWindow(a, b) {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return Math.abs(right - left) <= 5 * 60 * 1000;
}

function groupMessages(messages) {
  const groups = [];
  messages.forEach((message) => {
    const lastGroup = groups.at(-1);
    const lastMessage = lastGroup?.messages.at(-1);
    if (
      lastGroup &&
      lastGroup.authorUserID === message.authorUserID &&
      lastMessage &&
      sameCalendarDay(lastMessage.createdAt, message.createdAt) &&
      withinGroupWindow(lastMessage.createdAt, message.createdAt)
    ) {
      lastGroup.messages.push(message);
      return;
    }
    groups.push({
      authorUserID: message.authorUserID,
      messages: [message]
    });
  });
  return groups;
}

function formatDayLabel(value, preferences) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeZone: preferences.timezone === "system" ? undefined : preferences.timezone
  }).format(date);
}

function formatChatTime(value, preferences) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: preferences.timezone === "system" ? undefined : preferences.timezone
  }).format(date);
}

function messageGroupItem(group, author, formatDateTime, authorPresence = "", own = false) {
  const authorName = author?.displayName || group.authorUserID;
  return `
    <article class="chat-message-group${own ? " own" : ""}">
      ${shellAPI.renderAvatar(author || { id: group.authorUserID, displayName: authorName }, "chat-message-avatar")}
      <div class="chat-message-content">
        <div class="chat-message-heading">
          <h4${group.authorUserID ? ` data-user-id="${shellAPI.escapeHTML(group.authorUserID)}"` : ""}>${shellAPI.escapeHTML(authorName)}${authorPresence ? presenceDot(authorPresence) : ""}</h4>
        </div>
        <div class="chat-message-list">
          ${group.messages.map((message) => `
            <div class="chat-message-row">
              <p>${shellAPI.renderTagText(message.body)}</p>
              <time>${shellAPI.escapeHTML(formatDateTime(message.createdAt))}</time>
            </div>
          `).join("")}
        </div>
      </div>
    </article>
  `;
}

function isTimelineNearBottom(timeline) {
  if (!timeline) return true;
  const distance = timeline.scrollHeight - timeline.clientHeight - timeline.scrollTop;
  return distance <= 40;
}

function scrollChatTimelineToBottom() {
  const timeline = document.querySelector(".chat-timeline");
  if (!timeline) return;
  let attempts = 0;

  const forceBottom = () => {
    const maxTop = Math.max(0, timeline.scrollHeight - timeline.clientHeight);
    timeline.scrollTop = maxTop;
    attempts += 1;

    if (attempts < 12 && Math.abs(timeline.scrollTop - maxTop) > 2) {
      requestAnimationFrame(forceBottom);
    }
  };

  forceBottom();
  requestAnimationFrame(forceBottom);
  requestAnimationFrame(() => requestAnimationFrame(forceBottom));
  window.setTimeout(forceBottom, 24);
  window.setTimeout(forceBottom, 72);
  window.setTimeout(forceBottom, 160);
  window.setTimeout(forceBottom, 320);
  chatStickToBottom = true;
}

function focusMessageComposer(field) {
  if (!field) return;

  const focusAtEnd = () => {
    try {
      field.focus({ preventScroll: true });
    } catch {
      field.focus();
    }
    const end = field.value.length;
    try {
      field.setSelectionRange(end, end);
    } catch {
      // Some browsers may reject selection changes for unsupported input states.
    }
  };

  focusAtEnd();
  requestAnimationFrame(focusAtEnd);
  requestAnimationFrame(() => requestAnimationFrame(focusAtEnd));
  window.setTimeout(focusAtEnd, 24);
  window.setTimeout(focusAtEnd, 96);
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
        avatarEntity: partner || { id: partnerID, displayName: partner?.displayName || conversation.id },
        unread: payload.directUnread?.[conversation.id] || 0,
        conversation
      };
    });

    const roomThreads = payload.rooms.map((room) => ({
      id: room.id,
      title: room.name,
      copy: "",
      unread: payload.roomUnread?.[room.id] || 0,
      avatarEntity: { id: room.id, displayName: room.name },
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
    const currentThreadKey = selectedThread.id ? `${selectedThread.kind}:${selectedThread.id}` : "";
    const shouldStickToBottom = chatStickToBottom;

    const activeRoom = selectedThread.kind === "room" ? payload.rooms.find((room) => room.id === selectedThread.id) : null;
    const activeDirect = selectedThread.kind === "direct" ? payload.directConversations.find((conversation) => conversation.id === selectedThread.id) : null;
    const activeMessages = selectedThread.kind === "room"
      ? payload.roomMessages.filter((message) => message.conversationID === selectedThread.id)
      : payload.directMessages.filter((message) => message.conversationID === selectedThread.id);
    const latestMessageKey = activeMessages.length
      ? `${activeMessages.at(-1).id}:${activeMessages.length}`
      : "";
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
    const groupedMessages = groupMessages(activeMessages);
    const timelineItems = [];
    groupedMessages.forEach((group, index) => {
      const firstMessage = group.messages[0];
      const previousGroup = groupedMessages[index - 1];
      const previousFirstMessage = previousGroup?.messages[0];

      if (!previousFirstMessage || !sameCalendarDay(previousFirstMessage.createdAt, firstMessage.createdAt)) {
        timelineItems.push(`
          <div class="chat-day-separator">
            <span>${escapeHTML(formatDayLabel(firstMessage.createdAt, state.preferences))}</span>
          </div>
        `);
      }

      const author = payload.workspace.users.find((user) => user.id === group.authorUserID);
      timelineItems.push(messageGroupItem(
        group,
        author,
        (value) => formatChatTime(value, state.preferences),
        presenceByUserID.get(group.authorUserID),
        group.authorUserID === state.session.user.id
      ));
    });

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
                  <button id="open-room-composer" class="chat-icon-button" type="button" aria-label="Create room"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
                </div>
                <form id="room-form" class="compact-stack chat-inline-form hidden">
                  <input id="room-name" class="shell-input" placeholder="New room" required>
                  <button class="shell-button-secondary" type="submit"${roomTeamID ? "" : " disabled"}>Create room</button>
                </form>
                <div id="room-thread-list" class="chat-thread-list">
                  ${roomThreads.length
                    ? roomThreads.map((thread) => threadItem(thread.title, thread.copy, thread.unread, selectedThread.kind === "room" && selectedThread.id === thread.id, "room", thread.id, "", "", thread.avatarEntity)).join("")
                    : renderEmpty("No rooms", "Create the first team room.")}
                </div>
              </div>
              <div class="chat-mini-section">
                <div class="chat-section-heading">
                  <strong>Direct Messages</strong>
                  <button id="open-dm-composer" class="chat-icon-button" type="button" aria-label="Open direct message"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
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
                    ? directThreads.map((thread) => threadItem(thread.title, thread.copy, thread.unread, selectedThread.kind === "direct" && selectedThread.id === thread.id, "direct", thread.id, thread.presence, thread.userID, thread.avatarEntity)).join("")
                    : renderEmpty("No direct conversations", "Start the first DM below.")}
                </div>
              </div>
            </aside>
            <section class="chat-main">
              ${selectedThread.id ? `
                <div class="chat-timeline">
                  ${activeMessages.length
                    ? timelineItems.join("")
                    : renderEmpty("No messages", "Start the conversation.")}
                  <div class="chat-scroll-anchor" aria-hidden="true"></div>
                </div>
                <form id="message-form" class="chat-composer">
                  <textarea id="message-body" class="shell-textarea chat-composer-input" placeholder="Write a message" required></textarea>
                  <div class="inline-actions">
                    <button id="message-send-button" class="shell-button chat-send-button" type="submit" aria-label="Send message" title="Send message" disabled><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
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
                        ${shellAPI.renderAvatar(user, "chat-member-avatar")}
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
        syncThreadLocation(selectedThread);
        forceScrollToBottom = true;
        chatStickToBottom = true;
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
      syncThreadLocation(selectedThread);
      await refresh();
    });

    document.getElementById("dm-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const conversation = await requestJSON("/api/direct-conversations", {
        method: "POST",
        body: JSON.stringify({ participantUserID: document.getElementById("dm-user").value })
      });
      selectedThread = { kind: "direct", id: conversation.id };
      syncThreadLocation(selectedThread);
      await refresh();
    });

    const messageBodyField = document.getElementById("message-body");
    const messageSendButton = document.getElementById("message-send-button");

    function syncMessageComposerState() {
      if (!messageSendButton || !messageBodyField) return;
      messageSendButton.disabled = !messageBodyField.value.trim();
    }

    document.getElementById("message-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const bodyField = messageBodyField;
      const body = bodyField.value;
      if (!body.trim()) return;
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
      syncMessageComposerState();
      forceScrollToBottom = true;
      focusComposerAfterRefresh = true;
      keepComposerFocusCycles = 3;
      await refresh();
    });

    shellAPI.attachTagAutocomplete(messageBodyField);

    messageBodyField?.addEventListener("input", () => {
      syncMessageComposerState();
    });

    messageBodyField?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        document.getElementById("message-form")?.requestSubmit();
      }
    });

    syncMessageComposerState();

    if ((focusComposerAfterRefresh || keepComposerFocusCycles > 0) && messageBodyField) {
      focusMessageComposer(messageBodyField);
      focusComposerAfterRefresh = false;
      if (keepComposerFocusCycles > 0) {
        keepComposerFocusCycles -= 1;
      }
    }

    const timeline = document.querySelector(".chat-timeline");
    if (timeline) {
      timeline.addEventListener("scroll", () => {
        chatStickToBottom = isTimelineNearBottom(timeline);
      }, { passive: true });
    }

    if (
      currentThreadKey &&
      (
        forceScrollToBottom ||
        currentThreadKey !== lastRenderedThreadKey ||
        latestMessageKey !== lastRenderedMessageKey ||
        (shouldStickToBottom && currentThreadKey === lastRenderedThreadKey)
      )
    ) {
      requestAnimationFrame(() => {
        scrollChatTimelineToBottom();
      });
      forceScrollToBottom = false;
    }
    lastRenderedThreadKey = currentThreadKey;
    lastRenderedMessageKey = latestMessageKey;
  }
});

shell.refresh().catch((error) => {
  document.getElementById("app").innerHTML = `<pre>${shellAPI.escapeHTML(error.message)}</pre>`;
});
