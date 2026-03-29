const shellAPI = window.XHarborShell;

let docsCache = null;
let selectedPageID = "";

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

async function loadSession() {
  return requestJSON("/api/session");
}

async function loadUsers() {
  return requestJSON("/api/users");
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

async function fetchDocs() {
  docsCache = await requestJSON("/api/docs");
  if (!selectedPageID || !docsCache.pages.some((page) => page.id === selectedPageID)) {
    selectedPageID = docsCache.pages[0]?.id || "";
  }
  return docsCache;
}

async function createPage(payload) {
  return requestJSON("/api/pages", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function updatePage(pageID, payload) {
  return requestJSON(`/api/pages/${pageID}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

async function refreshWorkspace() {
  return requestJSON("/api/docs/refresh-workspace", {
    method: "POST",
    body: JSON.stringify({})
  });
}

function userRef(userID, label) {
  return `<span data-user-id="${shellAPI.escapeHTML(userID)}">${shellAPI.escapeHTML(label)}</span>`;
}

function userName(userID) {
  return docsCache?.snapshot?.workspace?.users?.find((user) => user.id === userID)?.displayName || userID;
}

function currentPage() {
  return docsCache?.pages.find((page) => page.id === selectedPageID) ?? null;
}

function revisionsForPage(pageID) {
  return (docsCache?.revisions || []).filter((revision) => revision.pageID === pageID);
}

function renderPageTree(nodes, depth = 0) {
  return nodes.map((node) => `
    <button class="doc-tree-item${node.id === selectedPageID ? " active" : ""}" type="button" data-page-id="${shellAPI.escapeHTML(node.id)}" style="margin-left:${depth * 14}px">
      <strong>${shellAPI.escapeHTML(node.title)}</strong>
      <span>${revisionsForPage(node.id).length}</span>
    </button>
    ${renderPageTree(node.children || [], depth + 1)}
  `).join("");
}

function escapeInline(text) {
  return shellAPI.escapeHTML(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let listType = null;
  let listItems = [];
  let codeLines = [];
  let inCode = false;

  function flushList() {
    if (!listType || !listItems.length) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${escapeInline(item)}</li>`).join("")}</${listType}>`);
    listType = null;
    listItems = [];
  }

  function flushCode() {
    if (!inCode) return;
    blocks.push(`<pre><code>${shellAPI.escapeHTML(codeLines.join("\n"))}</code></pre>`);
    inCode = false;
    codeLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      flushList();
      if (inCode) {
        flushCode();
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }
    if (!line.trim()) {
      flushList();
      continue;
    }
    if (/^###\s+/.test(line)) {
      flushList();
      blocks.push(`<h3>${escapeInline(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushList();
      blocks.push(`<h2>${escapeInline(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      flushList();
      blocks.push(`<h1>${escapeInline(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (/^- /.test(line)) {
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(line.replace(/^- /, ""));
      continue;
    }
    if (/^\d+\. /.test(line)) {
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(line.replace(/^\d+\. /, ""));
      continue;
    }
    if (/^>\s+/.test(line)) {
      flushList();
      blocks.push(`<blockquote>${escapeInline(line.replace(/^>\s+/, ""))}</blockquote>`);
      continue;
    }
    flushList();
    blocks.push(`<p>${escapeInline(line)}</p>`);
  }

  flushList();
  flushCode();

  return blocks.join("");
}

function pageOptions(pages, selectedValue) {
  return [
    `<option value="">Root page</option>`,
    ...pages.map((page) => `
      <option value="${shellAPI.escapeHTML(page.id)}"${page.id === selectedValue ? " selected" : ""}>
        ${shellAPI.escapeHTML(page.title)}
      </option>
    `)
  ].join("");
}

function revisionTable(revisions, formatDateTime) {
  if (!revisions.length) {
    return shellAPI.renderEmpty("No revisions", "This page has no saved history yet.");
  }

  return `
    <div class="doc-revision-table">
      ${revisions.map((revision) => `
        <div class="doc-revision-row">
          <span>v${shellAPI.escapeHTML(revision.version)}</span>
          <span>${shellAPI.escapeHTML(revision.summary)}</span>
          <span>${revision.authorUserID ? userRef(revision.authorUserID, userName(revision.authorUserID)) : "Unknown"}</span>
          <span>${shellAPI.escapeHTML(formatDateTime(revision.createdAt))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

const shell = shellAPI.createShell({
  appName: "xDoc",
  appSubtitle: "Markdown documentation workspace",
  defaultView: "library",
  navigation: [
    {
      section: "Docs",
      items: [
        { id: "library", label: "Library", copy: "Page tree and document metadata." },
        { id: "preview", label: "Preview", copy: "Rendered markdown for the active page." },
        { id: "edit", label: "Edit", copy: "Update markdown and page hierarchy." },
        { id: "history", label: "History", copy: "Revision timeline and change authors." }
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
      setHeader("Documentation Access", "Markdown spaces are available after authentication through the shared top-right login control.", "Signed out");
      setMetrics([]);
      setPanels([
        {
          span: "span-12",
          title: "Locked",
          copy: "Authenticate to browse and edit documentation pages.",
          html: renderEmpty("Sign in required", "Use the right side of the nav bar to authenticate into xDoc.")
        }
      ]);
      return;
    }

    const docs = await fetchDocs();
    const page = currentPage();
    const pageSidebar = `
      <div class="doc-sidebar">
        <div class="doc-inline-actions">
          <button id="refresh-docs-workspace" class="shell-button-secondary" type="button">Sync xGroup</button>
          <button id="new-root-page" class="shell-button" type="button">New root page</button>
          ${page ? '<button id="new-child-page" class="shell-button-secondary" type="button">New child page</button>' : ""}
        </div>
        <div class="doc-tree">${renderPageTree(docs.tree)}</div>
      </div>
    `;

    function attachPageActions() {
      document.querySelectorAll("[data-page-id]").forEach((button) => {
        button.addEventListener("click", async () => {
          selectedPageID = button.dataset.pageId;
          await refresh();
        });
      });

      document.getElementById("refresh-docs-workspace")?.addEventListener("click", async () => {
        await refreshWorkspace();
        await refresh();
      });

      document.getElementById("new-root-page")?.addEventListener("click", async () => {
        const created = await createPage({
          title: "Untitled Page",
          parentPageID: null,
          content: "# Untitled Page\n",
          summary: "Root page created."
        });
        selectedPageID = created.id;
        await refresh();
      });

      document.getElementById("new-child-page")?.addEventListener("click", async () => {
        if (!page) return;
        const created = await createPage({
          title: `${page.title} Notes`,
          parentPageID: page.id,
          content: `## ${page.title} Notes\n`,
          summary: "Child page created."
        });
        selectedPageID = created.id;
        await refresh();
      });
    }

    if (state.currentView === "library") {
      setMetrics([]);
      setHeader("Library", "Structured page tree and metadata without mixing editing and rendered markdown on one screen.", docs.syncStatus.lastSyncSucceeded ? "Workspace synced" : "Sync pending");
      setPanels([
        {
          span: "span-12",
          title: "Pages",
          copy: "Browse the documentation structure and inspect authorship before opening preview or edit.",
          html: `
            <div class="doc-workspace">
              ${pageSidebar}
              <div class="doc-details-grid">
                <div class="doc-metadata">
                  ${page ? `
                    <div class="doc-meta-grid">
                      <div><span>Title</span><strong>${escapeHTML(page.title)}</strong></div>
                      <div><span>Slug</span><strong>${escapeHTML(page.slug)}</strong></div>
                      <div><span>Created</span><strong>${escapeHTML(formatDateTime(page.createdAt))}</strong></div>
                      <div><span>Updated</span><strong>${escapeHTML(formatDateTime(page.updatedAt))}</strong></div>
                      <div><span>Author</span><strong>${userRef(page.createdByUserID, userName(page.createdByUserID))}</strong></div>
                      <div><span>Last editor</span><strong>${userRef(page.updatedByUserID, userName(page.updatedByUserID))}</strong></div>
                    </div>
                  ` : renderEmpty("No page selected", "Pick a page from the tree to inspect document details.")}
                </div>
                <div class="doc-metadata">
                  <div class="panel-heading">
                    <div>
                      <h2 class="panel-title">Recent Revisions</h2>
                      <p class="panel-copy">Every save creates a revision with author and timestamp.</p>
                    </div>
                  </div>
                  ${page ? revisionTable(revisionsForPage(page.id), formatDateTime) : renderEmpty("No revisions", "Select a page to see its history.")}
                </div>
              </div>
            </div>
          `
        }
      ]);

      attachPageActions();
      return;
    }

    if (state.currentView === "preview") {
      setMetrics([]);
      setHeader("Preview", "Rendered markdown is isolated from editing so the page can be reviewed without authoring controls.", page ? page.title : "No page selected");
      setPanels([
        {
          span: "span-12",
          title: "Rendered Page",
          copy: "Review the active page as documentation, with metadata kept beside the preview instead of the editor.",
          html: `
            <div class="doc-workspace">
              ${pageSidebar}
              <div class="doc-details-grid">
                <div class="doc-preview-body">
                  ${page ? renderMarkdown(page.content) : renderEmpty("Preview unavailable", "Select a page to render its markdown.")}
                </div>
                <div class="doc-metadata">
                  ${page ? `
                    <div class="doc-meta-grid">
                      <div><span>Created</span><strong>${escapeHTML(formatDateTime(page.createdAt))}</strong></div>
                      <div><span>Updated</span><strong>${escapeHTML(formatDateTime(page.updatedAt))}</strong></div>
                      <div><span>Author</span><strong>${userRef(page.createdByUserID, userName(page.createdByUserID))}</strong></div>
                      <div><span>Last editor</span><strong>${userRef(page.updatedByUserID, userName(page.updatedByUserID))}</strong></div>
                    </div>
                  ` : renderEmpty("No page selected", "Choose a page from the left rail to preview it.")}
                </div>
              </div>
            </div>
          `
        }
      ]);

      attachPageActions();
      return;
    }

    if (state.currentView === "edit") {
      setMetrics([]);
      setHeader("Edit", "Authoring is separated from preview so markdown and structure changes can be made in a focused screen.", page ? page.title : "No page selected");
      setPanels([
        {
          span: "span-12",
          title: "Editor",
          copy: "Update markdown, title, and hierarchy without competing with the rendered page view.",
          html: `
            <div class="doc-workspace">
              ${pageSidebar}
              <div class="doc-details-grid">
                <div class="doc-editor">
                  ${page ? `
                    <form id="page-editor" class="doc-field">
                      <label>Title
                        <input id="page-title" name="title" type="text" value="${escapeHTML(page.title)}" required>
                      </label>
                      <label>Parent
                        <select id="page-parent" name="parentPageID">
                          ${pageOptions(docs.pages.filter((item) => item.id !== page.id), page.parentPageID)}
                        </select>
                      </label>
                      <label>Markdown
                        <textarea id="page-content" name="content">${escapeHTML(page.content)}</textarea>
                      </label>
                      <label>Change Summary
                        <input id="page-summary" name="summary" type="text" placeholder="What changed?">
                      </label>
                      <div class="doc-inline-actions">
                        <button class="shell-button" type="submit">Save page</button>
                      </div>
                    </form>
                  ` : renderEmpty("No page selected", "Select a page to edit it or create a new root page.")}
                </div>
                <div class="doc-metadata">
                  ${page ? `
                    <div class="doc-meta-grid">
                      <div><span>Created</span><strong>${escapeHTML(formatDateTime(page.createdAt))}</strong></div>
                      <div><span>Updated</span><strong>${escapeHTML(formatDateTime(page.updatedAt))}</strong></div>
                      <div><span>Author</span><strong>${userRef(page.createdByUserID, userName(page.createdByUserID))}</strong></div>
                      <div><span>Last editor</span><strong>${userRef(page.updatedByUserID, userName(page.updatedByUserID))}</strong></div>
                    </div>
                  ` : renderEmpty("No metadata", "Select a page to edit and inspect authorship details.")}
                </div>
              </div>
            </div>
          `
        }
      ]);

      attachPageActions();

      document.getElementById("page-editor")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!page) return;
        const form = new FormData(event.currentTarget);
        await updatePage(page.id, {
          title: form.get("title"),
          parentPageID: form.get("parentPageID") || null,
          content: form.get("content"),
          summary: form.get("summary")
        });
        await refresh();
      });

      return;
    }

    setMetrics([]);
    setHeader("Revision History", "A workspace-wide audit trail of page edits, authors, and saved revisions.", `${docs.revisions.length} revisions`);
    setPanels([
      {
        span: "span-12",
        title: "Revision Timeline",
        copy: "Track who changed what and when across the documentation tree.",
        html: docs.revisions.length
          ? `
            <div class="doc-revision-table">
              ${docs.revisions.map((revision) => `
                <div class="doc-revision-row">
                  <span>v${escapeHTML(revision.version)}</span>
                  <span>${escapeHTML(revision.title)} · ${escapeHTML(revision.summary)}</span>
                  <span>${userRef(revision.authorUserID, userName(revision.authorUserID))}</span>
                  <span>${escapeHTML(formatDateTime(revision.createdAt))}</span>
                </div>
              `).join("")}
            </div>
          `
          : renderEmpty("No revisions", "Page history will appear here after the first edit.")
      }
    ]);
  }
});

shell.refresh();
