const shellAPI = window.XHarborShell;
const requestJSON = shellAPI.requestJSON;
const viewPanel = shellAPI.viewPanel;
const namedSection = shellAPI.namedSection;
const bindActions = shellAPI.bindActions;
const bindFormSubmit = shellAPI.bindFormSubmit;
const createStateRefresher = shellAPI.createStateRefresher;

async function fetchTags(query = "") {
  const search = query ? `?query=${encodeURIComponent(query)}` : "";
  return requestJSON(`/api/tags${search}`);
}

async function reindexTags() {
  return requestJSON("/api/tags/reindex", {
    method: "POST",
    body: JSON.stringify({})
  });
}

async function createAlias(tag, canonicalTag) {
  return requestJSON("/api/tags/aliases", {
    method: "POST",
    body: JSON.stringify({ tag, canonicalTag })
  });
}

async function deleteAlias(tag) {
  return requestJSON(`/api/tags/aliases/${encodeURIComponent(shellAPI.normalizeTag(tag))}`, {
    method: "DELETE"
  });
}

function sourceLabel(source) {
  if (source === "xbacklog") return "xBacklog";
  if (source === "xtalk") return "xTalk";
  if (source === "xdoc") return "xDoc";
  return source;
}

function itemLinkLabel(item) {
  if (item.kind === "task") return "Task";
  if (item.kind === "room") return "Room";
  if (item.kind === "direct") return "Direct";
  if (item.kind === "page") return "Page";
  return item.kind;
}

function sourceItemURL(item) {
  if (item.source === "xtalk") {
    const kind = item.kind === "direct" ? "direct" : "room";
    return `http://127.0.0.1:3003/?threadKind=${encodeURIComponent(kind)}&threadId=${encodeURIComponent(item.conversationID || item.id)}`;
  }
  if (item.source === "xbacklog") {
    return `http://127.0.0.1:3001/?view=board&taskId=${encodeURIComponent(item.taskID || item.id)}`;
  }
  if (item.source === "xdoc") {
    return `http://127.0.0.1:3004/?pageId=${encodeURIComponent(item.pageID || item.id)}&mode=preview`;
  }
  return "#";
}

function similarTagSuggestions(tags = [], aliases = []) {
  const aliasSet = new Set((aliases || []).map((item) => item.tag));
  const raw = [...tags].sort((left, right) => left.tag.localeCompare(right.tag));
  const suggestions = [];
  const seen = new Set();

  function skeleton(tag) {
    return String(tag || "").replace(/[-_]/g, "");
  }

  for (let index = 0; index < raw.length; index += 1) {
    for (let inner = index + 1; inner < raw.length; inner += 1) {
      const left = raw[index].tag;
      const right = raw[inner].tag;
      if (aliasSet.has(left) || aliasSet.has(right)) continue;
      const sameSkeleton = skeleton(left) === skeleton(right);
      const prefixMatch = left.startsWith(right) || right.startsWith(left);
      if (!sameSkeleton && !prefixMatch) continue;

      const canonicalTag = left.length <= right.length ? left : right;
      const aliasTag = canonicalTag === left ? right : left;
      const key = `${aliasTag}->${canonicalTag}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ tag: aliasTag, canonicalTag });
      if (suggestions.length >= 8) return suggestions;
    }
  }

  return suggestions;
}
const tagQueryRouter = shellAPI.createQueryRouter({
  defaults: { query: "" },
  read: (location) => shellAPI.normalizeTag(location.query),
  write: (query = "") => ({ query: shellAPI.normalizeTag(query) })
});

let currentQuery = tagQueryRouter.read();

const shell = shellAPI.createShell({
  appName: "xTag",
  appSubtitle: "Cross-system tag search",
  shellClassName: "shell-platform",
  defaultView: "search",
  navigation: [
    {
      section: "Discovery",
      items: [
        { id: "search", label: "Search", copy: "Aggregate tag usage across modules." }
      ]
    },
    {
      section: "System",
      items: [
        { id: "settings", label: "Settings", copy: "Accent palette and timezone preferences." }
      ]
    }
  ],
  loadUsers: shellAPI.loadUsers,
  loadSession: shellAPI.loadSession,
  onLogin: shellAPI.createSession,
  onLogout: shellAPI.destroySession,
  renderView: async ({ state, setHeader, setMetrics, setPanels, renderEmpty, escapeHTML, formatDateTime, refresh }) => {
    if (!state.session.authenticated) {
      setHeader("Tag Search Access", "Tag search is available after authentication through the shared top-right login control.", "Signed out");
      setMetrics([]);
      setPanels([
        viewPanel({
          span: "span-12",
          title: "Locked",
          copy: "Authenticate to aggregate hashtags across platform modules.",
          html: renderEmpty("Sign in required", "Use the right side of the nav bar to authenticate into xTag.")
        })
      ]);
      return;
    }

    currentQuery = shellAPI.normalizeTag(currentQuery);
    tagQueryRouter.sync(currentQuery);
    const refreshTagState = createStateRefresher({
      refresh,
      sync: () => {
        currentQuery = shellAPI.normalizeTag(currentQuery);
        tagQueryRouter.sync(currentQuery);
      }
    });
    const payload = await fetchTags(currentQuery);
    const mergeSuggestions = similarTagSuggestions(payload.tags, payload.aliases);
    setHeader("Tag Search", "Aggregate case-insensitive hashtag usage across conversations, tasks, and documentation.", payload.syncStatus.lastSyncSucceeded ? "Indexed" : "Sync pending");
    setMetrics([
      { label: "Tags", value: payload.index.tagCount, meta: "Known normalized tags" },
      { label: "Items", value: payload.index.itemCount, meta: "Indexed tagged entities" },
      { label: "Sources", value: payload.index.sourceCount, meta: "Connected modules" }
    ]);

    const tagChips = payload.tags.length
      ? `<div class="tag-chip-list">${payload.tags.map((tag) => `
          <button class="tag-chip${payload.query && tag.tag === payload.query ? " active" : ""}" type="button" data-action="select-tag" data-tag="${escapeHTML(tag.tag)}">
            <strong>${escapeHTML(tag.displayTag)}</strong>
            <span>${escapeHTML(String(tag.itemCount))}</span>
          </button>
        `).join("")}</div>`
      : renderEmpty("No tags", "Refresh the index or add hashtags in xTalk, xBacklog, or xDoc.");

    setPanels([
      viewPanel({
        span: "span-12",
        title: "Search",
        copy: "Search accepts tags with or without a leading #. Matching is case insensitive.",
        html: `
          <form id="tag-search-form" class="tag-search-form">
            <input id="tag-search-input" name="query" class="tag-search-input" type="search" placeholder="#platform, auth, release" value="${escapeHTML(currentQuery)}">
            <button class="shell-button" type="submit">Search</button>
            <button class="shell-button-secondary" type="button" data-action="reindex-tags">Reindex</button>
          </form>
          <div class="tag-source-strip">
            ${(payload.index.sources || []).map((source) => `
              <span class="tag-source-pill">${escapeHTML(sourceLabel(source.id))} · ${escapeHTML(String(source.itemCount))}</span>
            `).join("")}
          </div>
        `
      }),
      viewPanel({
        span: "span-12",
        title: "Known Tags",
        copy: payload.query ? `Matching results for #${payload.query}.` : "Most active tags across the indexed modules.",
        html: tagChips
      }),
      viewPanel({
        span: "span-12",
        title: "Tag Management",
        copy: "Merge similar tags into one canonical tag without rewriting source content.",
        html: `
          <div class="tag-admin-grid">
            <form id="tag-alias-form" class="tag-search-form">
              <select id="tag-alias-source" name="sourceTag" class="tag-search-input">
                <option value="">Choose source tag</option>
                ${payload.tags.map((tag) => `<option value="${escapeHTML(tag.tag)}">${escapeHTML(tag.displayTag)}</option>`).join("")}
              </select>
              <input id="tag-alias-target" name="canonicalTag" class="tag-search-input" type="search" placeholder="Canonical tag, e.g. #platform">
              <button class="shell-button-secondary" type="submit">Merge tag</button>
            </form>
            <div class="row-list">
              ${payload.aliases?.length
                ? payload.aliases.map((alias) => `
                    <article class="row-item two-col">
                      <div class="row-main">
                        <span class="row-title">#${escapeHTML(alias.tag)}</span>
                        <span class="row-subtitle">Canonical: <a class="tag-link" href="${shellAPI.buildTagSearchURL(alias.canonicalTag)}">#${escapeHTML(alias.canonicalTag)}</a></span>
                      </div>
                      <div class="row-meta">
                        <button class="shell-button-secondary" type="button" data-action="remove-alias" data-tag="${escapeHTML(alias.tag)}">Remove</button>
                      </div>
                    </article>
                  `).join("")
                : renderEmpty("No aliases", "All tags currently resolve to themselves.")}
            </div>
            <div class="row-list">
              ${mergeSuggestions.length
                ? mergeSuggestions.map((suggestion) => `
                    <article class="row-item two-col">
                      <div class="row-main">
                        <span class="row-title">Suggested merge</span>
                        <span class="row-subtitle">#${escapeHTML(suggestion.tag)} → #${escapeHTML(suggestion.canonicalTag)}</span>
                      </div>
                      <div class="row-meta">
                        <button class="shell-button-secondary" type="button" data-action="apply-suggestion" data-tag="${escapeHTML(suggestion.tag)}" data-canonical-tag="${escapeHTML(suggestion.canonicalTag)}">Apply</button>
                      </div>
                    </article>
                  `).join("")
                : renderEmpty("No suggestions", "Similar tags will appear here when xTag detects merge candidates.")}
            </div>
          </div>
        `
      }),
      viewPanel({
        span: "span-12",
        title: "Results",
        copy: payload.query ? `Entities containing #${payload.query}.` : "Recent tagged entities across the platform.",
        html: payload.groupedItems.length
          ? payload.groupedItems.map((group) => namedSection({
              title: sourceLabel(group.source),
              copy: `${group.items.length} tagged ${group.items.length === 1 ? "result" : "results"}`,
              className: "tag-result-group",
              content: `
                <div class="row-list">
                  ${group.items.map((item) => `
                    <article class="data-card tag-result-card">
                      <div class="tag-result-header">
                        <div>
                          <h3>${escapeHTML(item.title)}</h3>
                          <p>${escapeHTML(itemLinkLabel(item))} · ${escapeHTML(item.kind)}</p>
                        </div>
                        <div class="tag-result-actions">
                          <span class="tag-source-pill">${escapeHTML(sourceLabel(item.source))}</span>
                          <a class="shell-button-secondary tag-open-link" href="${sourceItemURL(item)}">Open source</a>
                        </div>
                      </div>
                      <p>${shellAPI.renderTagText(item.excerpt)}</p>
                      <div class="tag-chip-list compact">
                        ${item.tags.map((tag) => `<button class="tag-chip small${payload.query && tag === payload.query ? " active" : ""}" type="button" data-action="select-tag" data-tag="${escapeHTML(tag)}"><strong>#${escapeHTML(tag)}</strong></button>`).join("")}
                      </div>
                      ${item.lastSeenAt ? `<div class="dense-sub">Last activity: ${escapeHTML(formatDateTime(item.lastSeenAt))}</div>` : ""}
                    </article>
                  `).join("")}
                </div>
              `
            })).join("")
          : renderEmpty("No tagged entities", payload.query ? "No indexed entities contain this tag yet." : "Reindex the platform to load tagged entities.")
      })
    ]);

    bindFormSubmit("#view-content", "#tag-search-form", async (formData) => {
      await refreshTagState(() => {
        currentQuery = formData.get("query") || "";
      });
    }, "xtag-search-submit");

    shellAPI.attachTagAutocomplete(document.getElementById("tag-search-input"));

    bindFormSubmit("#view-content", "#tag-alias-form", async (formData) => {
      const sourceTag = formData.get("sourceTag") || "";
      const canonicalTag = formData.get("canonicalTag") || "";
      await createAlias(sourceTag, canonicalTag);
      await refreshTagState(() => {
        currentQuery = canonicalTag;
      });
    }, "xtag-alias-submit");

    bindActions("#view-content", {
      "reindex-tags": async () => {
        await reindexTags();
        await refresh();
      },
      "remove-alias": async (button) => {
        await deleteAlias(button.dataset.tag || "");
        await refresh();
      },
      "apply-suggestion": async (button) => {
        await createAlias(button.dataset.tag || "", button.dataset.canonicalTag || "");
        await refreshTagState(() => {
          currentQuery = button.dataset.canonicalTag || currentQuery;
        });
      },
      "select-tag": async (button) => {
        await refreshTagState(() => {
          currentQuery = button.dataset.tag || "";
        });
      }
    }, "xtag-actions");
  }
});

shell.refresh().catch((error) => {
  console.error(error);
});
