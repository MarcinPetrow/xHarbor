const shellAPI = window.XHarborShell;

let docsCache = null;
let selectedPageID = "";
let docMode = "preview";
const expandedPageIDs = new Set();

function readDocLocation() {
  const url = new URL(window.location.href);
  return {
    pageID: url.searchParams.get("pageId") || "",
    mode: url.searchParams.get("mode") || "preview"
  };
}

function syncDocLocation(pageID, mode) {
  const url = new URL(window.location.href);
  if (pageID) {
    url.searchParams.set("pageId", pageID);
  } else {
    url.searchParams.delete("pageId");
  }
  if (mode && mode !== "preview") {
    url.searchParams.set("mode", mode);
  } else {
    url.searchParams.delete("mode");
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
  ensureExpandedPath(selectedPageID);
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

function pageByID(pageID) {
  return docsCache?.pages.find((page) => page.id === pageID) || null;
}

function parentPage(page) {
  return page?.parentPageID ? pageByID(page.parentPageID) : null;
}

function pagePath(pageID) {
  const path = [];
  let cursor = pageByID(pageID);
  while (cursor) {
    path.unshift(cursor.title);
    cursor = parentPage(cursor);
  }
  return path;
}

function ensureExpandedPath(pageID) {
  let cursor = pageByID(pageID);
  while (cursor?.parentPageID) {
    expandedPageIDs.add(cursor.parentPageID);
    cursor = parentPage(cursor);
  }
}

function renderPageTree(nodes, depth = 0) {
  return nodes.map((node) => {
    const childCount = (node.children || []).length;
    const isExpanded = expandedPageIDs.has(node.id);
    const visualDepth = Math.min(depth, 4);
    return `
      <div class="doc-tree-node" style="--doc-depth:${visualDepth}">
        <div class="doc-tree-row${node.id === selectedPageID ? " active" : ""}">
          ${childCount
            ? `<button class="doc-tree-toggle${isExpanded ? " expanded" : ""}" type="button" data-toggle-page-id="${shellAPI.escapeHTML(node.id)}" aria-label="${isExpanded ? "Collapse" : "Expand"}">⌃</button>`
            : `<span class="doc-tree-toggle-spacer"></span>`}
          <div class="doc-tree-item${node.id === selectedPageID ? " active" : ""}">
            <button class="doc-tree-item-trigger" type="button" data-page-id="${shellAPI.escapeHTML(node.id)}">
              <strong>${shellAPI.escapeHTML(node.title)}</strong>
            </button>
            <button class="doc-tree-add" type="button" data-add-child-page-id="${shellAPI.escapeHTML(node.id)}" aria-label="Add article in this section" title="Add article">+</button>
          </div>
        </div>
        ${childCount && isExpanded ? `<div class="doc-tree-children">${renderPageTree(node.children || [], depth + 1)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function escapeInline(text) {
  return shellAPI.renderTagText(text)
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
  shellClassName: "shell-docs",
  defaultView: "docs",
  navigation: [
    {
      section: "Docs",
      items: [
        { id: "docs", label: "Docs", copy: "Page tree and document content." }
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
    const locationState = readDocLocation();
    if (locationState.pageID && docs.pages.some((page) => page.id === locationState.pageID)) {
      selectedPageID = locationState.pageID;
      ensureExpandedPath(selectedPageID);
    }
    if (["preview", "edit", "history"].includes(locationState.mode)) {
      docMode = locationState.mode;
    }
    const page = currentPage();
    const pageRevisions = page ? revisionsForPage(page.id) : [];
    const breadcrumb = page ? pagePath(page.id).join(" / ") : "";
    const pageSidebar = `
      <aside class="doc-sidebar">
        <div class="doc-inline-actions">
          <button id="new-root-page" class="doc-icon-button" type="button" aria-label="New root page" title="New root page">+</button>
        </div>
        <div class="doc-tree">${renderPageTree(docs.tree)}</div>
      </aside>
    `;

    function attachPageActions() {
      document.querySelectorAll("[data-page-id]").forEach((button) => {
        button.addEventListener("click", async () => {
          selectedPageID = button.dataset.pageId;
          docMode = "preview";
          ensureExpandedPath(selectedPageID);
          await refresh();
        });
      });

      document.querySelectorAll("[data-toggle-page-id]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.stopPropagation();
          const pageID = button.dataset.togglePageId;
          if (expandedPageIDs.has(pageID)) {
            expandedPageIDs.delete(pageID);
          } else {
            expandedPageIDs.add(pageID);
          }
          await refresh();
        });
      });

      document.querySelectorAll("[data-add-child-page-id]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.stopPropagation();
          const parentPageID = button.dataset.addChildPageId;
          const parent = docs.pages.find((item) => item.id === parentPageID);
          const created = await createPage({
            title: parent ? `${parent.title} Notes` : "Untitled Page",
            parentPageID,
            content: parent ? `## ${parent.title} Notes\n` : "# Untitled Page\n",
            summary: "Child page created."
          });
          selectedPageID = created.id;
          docMode = "preview";
          ensureExpandedPath(selectedPageID);
          expandedPageIDs.add(parentPageID);
          await refresh();
        });
      });

      document.getElementById("new-root-page")?.addEventListener("click", async () => {
        const created = await createPage({
          title: "Untitled Page",
          parentPageID: null,
          content: "# Untitled Page\n",
          summary: "Root page created."
        });
        selectedPageID = created.id;
        docMode = "preview";
        ensureExpandedPath(selectedPageID);
        await refresh();
      });
    }
    syncDocLocation(selectedPageID, docMode);
    setMetrics([]);
    setHeader("", "", "", { hidden: true });
    setPanels([
      {
        span: "span-12",
        className: "panel-bare",
        html: `
          <div class="doc-shell">
            ${pageSidebar}
            <section class="doc-main">
              <div class="doc-document">
                <header class="doc-document-header">
                  <div class="doc-document-copy">
                    <h2>${escapeHTML(page?.title || "Documentation")}</h2>
                    <p>${escapeHTML(page ? breadcrumb : "Select a page from the left sidebar.")}</p>
                  </div>
                  <div class="doc-mode-actions">
                    <button id="doc-preview-mode" class="doc-icon-button${docMode === "preview" ? " active" : ""}" type="button" aria-label="Preview document" title="Preview">◫</button>
                    <button id="doc-edit-mode" class="doc-icon-button${docMode === "edit" ? " active" : ""}" type="button" aria-label="Edit document" title="Edit">✎</button>
                    <button id="doc-history-mode" class="doc-icon-button${docMode === "history" ? " active" : ""}" type="button" aria-label="View history" title="History">↺</button>
                  </div>
                </header>
                ${docMode === "preview" ? `
                  <div class="doc-main-grid">
                    <article class="doc-preview-body">
                      ${page ? renderMarkdown(page.content) : renderEmpty("Preview unavailable", "Select a page to render its markdown.")}
                    </article>
                    <aside class="doc-metadata">
                      ${page ? `
                        <div class="doc-meta-grid">
                          <div><span>Created</span><strong>${escapeHTML(formatDateTime(page.createdAt))}</strong></div>
                          <div><span>Updated</span><strong>${escapeHTML(formatDateTime(page.updatedAt))}</strong></div>
                          <div><span>Author</span><strong>${userRef(page.createdByUserID, userName(page.createdByUserID))}</strong></div>
                          <div><span>Last editor</span><strong>${userRef(page.updatedByUserID, userName(page.updatedByUserID))}</strong></div>
                        </div>
                      ` : renderEmpty("No page selected", "Choose a page from the sidebar to preview it.")}
                    </aside>
                  </div>
                ` : ""}
                ${docMode === "edit" ? `
                  <div class="doc-main-grid">
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
                    <aside class="doc-metadata">
                      ${page ? `
                        <div class="doc-meta-grid">
                          <div><span>Created</span><strong>${escapeHTML(formatDateTime(page.createdAt))}</strong></div>
                          <div><span>Updated</span><strong>${escapeHTML(formatDateTime(page.updatedAt))}</strong></div>
                          <div><span>Author</span><strong>${userRef(page.createdByUserID, userName(page.createdByUserID))}</strong></div>
                          <div><span>Last editor</span><strong>${userRef(page.updatedByUserID, userName(page.updatedByUserID))}</strong></div>
                        </div>
                      ` : renderEmpty("No metadata", "Select a page to edit and inspect authorship details.")}
                    </aside>
                  </div>
                ` : ""}
                ${docMode === "history" ? `
                  <div class="doc-main-grid">
                    <article class="doc-revision-table">
                      ${page ? revisionTable(pageRevisions, formatDateTime) : renderEmpty("No page selected", "Select a page to inspect its revision history.")}
                    </article>
                    <aside class="doc-metadata">
                      ${page ? `
                        <div class="doc-meta-grid">
                          <div><span>Current version</span><strong>v${escapeHTML(String(pageRevisions[0]?.version || 1))}</strong></div>
                          <div><span>Revision count</span><strong>${escapeHTML(String(pageRevisions.length))}</strong></div>
                          <div><span>Author</span><strong>${userRef(page.createdByUserID, userName(page.createdByUserID))}</strong></div>
                          <div><span>Last editor</span><strong>${userRef(page.updatedByUserID, userName(page.updatedByUserID))}</strong></div>
                        </div>
                      ` : renderEmpty("No history", "Select a page to inspect its changes.")}
                    </aside>
                  </div>
                ` : ""}
              </div>
            </section>
          </div>
        `
      }
    ]);

    attachPageActions();

    document.getElementById("doc-preview-mode")?.addEventListener("click", async () => {
      docMode = "preview";
      await refresh();
    });

    document.getElementById("doc-edit-mode")?.addEventListener("click", async () => {
      docMode = "edit";
      await refresh();
    });

    document.getElementById("doc-history-mode")?.addEventListener("click", async () => {
      docMode = "history";
      await refresh();
    });

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
      docMode = "preview";
      await refresh();
    });

    shellAPI.attachTagAutocomplete(document.getElementById("page-content"));
  }
});

shell.refresh();
