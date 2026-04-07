(function initShellModule() {
  const preferenceKey = "xharbor_ui";
  const accents = {
    amber: { label: "Amber", accent: "#d97706", strong: "#b45309", soft: "rgba(217, 119, 6, 0.12)", ring: "rgba(217, 119, 6, 0.2)" },
    crimson: { label: "Crimson", accent: "#dc2626", strong: "#b91c1c", soft: "rgba(220, 38, 38, 0.12)", ring: "rgba(220, 38, 38, 0.2)" },
    cobalt: { label: "Cobalt", accent: "#2563eb", strong: "#1d4ed8", soft: "rgba(37, 99, 235, 0.12)", ring: "rgba(37, 99, 235, 0.2)" },
    violet: { label: "Violet", accent: "#7c3aed", strong: "#6d28d9", soft: "rgba(124, 58, 237, 0.12)", ring: "rgba(124, 58, 237, 0.2)" },
    teal: { label: "Teal", accent: "#0f766e", strong: "#115e59", soft: "rgba(15, 118, 110, 0.12)", ring: "rgba(15, 118, 110, 0.2)" },
    magenta: { label: "Magenta", accent: "#db2777", strong: "#be185d", soft: "rgba(219, 39, 119, 0.12)", ring: "rgba(219, 39, 119, 0.2)" }
  };

  const timezones = [
    { value: "system", label: "System" },
    { value: "UTC", label: "UTC" },
    { value: "Europe/Warsaw", label: "Europe/Warsaw" },
    { value: "Europe/London", label: "Europe/London" },
    { value: "America/New_York", label: "America/New_York" },
    { value: "America/Los_Angeles", label: "America/Los_Angeles" },
    { value: "Asia/Tokyo", label: "Asia/Tokyo" }
  ];

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  const TAG_PATTERN = /(^|[^a-z0-9_])#([a-z0-9][a-z0-9_-]*)/gi;

  function normalizeTag(value) {
    return String(value || "").trim().replace(/^#+/, "").toLowerCase();
  }

  function buildTagSearchURL(tag) {
    const normalized = normalizeTag(tag);
    return `http://127.0.0.1:3005/?query=${encodeURIComponent(normalized)}`;
  }

  function readLocationState(defaults = {}) {
    const url = new URL(window.location.href);
    return Object.fromEntries(
      Object.entries(defaults).map(([key, defaultValue]) => [
        key,
        url.searchParams.get(key) ?? defaultValue
      ])
    );
  }

  function syncLocationState(values = {}, defaults = {}) {
    const url = new URL(window.location.href);
    Object.entries(values).forEach(([key, value]) => {
      const defaultValue = defaults[key];
      if (value === undefined || value === null || value === "" || value === defaultValue) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  function renderTagText(value) {
    const input = String(value ?? "");
    let cursor = 0;
    let html = "";

    input.replace(TAG_PATTERN, (match, prefix, rawTag, offset) => {
      html += escapeHTML(input.slice(cursor, offset));
      html += escapeHTML(prefix);
      html += `<a class="tag-link" href="${buildTagSearchURL(rawTag)}">#${escapeHTML(rawTag)}</a>`;
      cursor = offset + match.length;
      return match;
    });

    html += escapeHTML(input.slice(cursor));
    return html;
  }

  const avatarPalettes = [
    { bg: "#dbeafe", fg: "#1d4ed8" },
    { bg: "#ede9fe", fg: "#6d28d9" },
    { bg: "#fae8ff", fg: "#a21caf" },
    { bg: "#ccfbf1", fg: "#0f766e" },
    { bg: "#dcfce7", fg: "#166534" },
    { bg: "#fee2e2", fg: "#b91c1c" }
  ];

  function hashString(value) {
    return [...String(value || "xharbor")].reduce((hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0, 0);
  }

  function avatarColors(entity) {
    const display = typeof entity === "string"
      ? entity
      : entity?.id || entity?.email || entity?.displayName || `${entity?.firstName || ""}${entity?.lastName || ""}`;
    const palette = avatarPalettes[Math.abs(hashString(display)) % avatarPalettes.length];
    return palette;
  }

  function avatarLabel(entity) {
    if (typeof entity === "string") return entity;
    return [entity?.firstName, entity?.lastName].filter(Boolean).join(" ").trim()
      || entity?.displayName
      || entity?.email
      || entity?.id
      || "?";
  }

  function avatarInitials(entity) {
    const label = avatarLabel(entity);
    const parts = label.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return label.slice(0, 2).toUpperCase();
  }

  function renderAvatar(entity, className = "") {
    const label = avatarLabel(entity);
    const colors = avatarColors(entity);
    const classes = ["user-avatar", className].filter(Boolean).join(" ");
    const userAttribute = entity?.id ? ` data-user-id="${escapeHTML(entity.id)}"` : "";
    const style = `--avatar-bg:${colors.bg};--avatar-fg:${colors.fg};`;

    if (entity?.avatarDataURL) {
      return `<span class="${classes}" style="${style}"${userAttribute}><img src="${escapeHTML(entity.avatarDataURL)}" alt="${escapeHTML(label)}"></span>`;
    }

    return `<span class="${classes}" style="${style}"${userAttribute}><span class="user-avatar-fallback">${escapeHTML(avatarInitials(entity))}</span></span>`;
  }

  function renderUserRef(entity, fallback = "Unknown user", className = "user-ref-inline", avatarClassName = "") {
    if (!entity) return escapeHTML(fallback);
    const userAttribute = entity?.id ? ` data-user-id="${escapeHTML(entity.id)}"` : "";
    const label = entity?.displayName || avatarLabel(entity);
    return `<span class="${escapeHTML(className)}"${userAttribute}>${renderAvatar(entity, avatarClassName)}<span>${escapeHTML(label)}</span></span>`;
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

  function ensureFontAwesome() {
    if (document.getElementById("fontawesome-stylesheet")) {
      return;
    }

    const link = document.createElement("link");
    link.id = "fontawesome-stylesheet";
    link.rel = "stylesheet";
    link.href = "/shared/fontawesome/css/all.min.css";
    document.head.append(link);
  }

  async function requestTagSuggestions(query = "") {
    const search = query ? `?query=${encodeURIComponent(normalizeTag(query))}` : "";
    const response = await fetch(`/api/tags${search}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return (payload.tags || []).slice(0, 8).map((tag) => ({
      tag: normalizeTag(tag.tag || tag.displayTag),
      displayTag: tag.displayTag || `#${normalizeTag(tag.tag)}`
    }));
  }

  function attachTagAutocomplete(field) {
    if (!field || field.dataset.tagAutocompleteBound === "true") {
      return;
    }

    field.dataset.tagAutocompleteBound = "true";
    const menuID = `tag-autocomplete-${field.id || Math.random().toString(36).slice(2)}`;
    document.getElementById(menuID)?.remove();
    const menu = document.createElement("div");
    menu.id = menuID;
    menu.className = "tag-autocomplete-menu";
    document.body.appendChild(menu);

    let suggestions = [];
    let activeIndex = 0;
    let blurTimer = null;
    let requestVersion = 0;

    function hideMenu() {
      menu.classList.remove("open");
      menu.innerHTML = "";
      suggestions = [];
      activeIndex = 0;
    }

    function positionMenu() {
      if (!menu.classList.contains("open")) return;
      const rect = field.getBoundingClientRect();
      menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 292))}px`;
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.width = `${Math.min(Math.max(rect.width, 220), 280)}px`;
    }

    function currentTrigger() {
      const value = field.value || "";
      const caret = typeof field.selectionStart === "number" ? field.selectionStart : value.length;
      const beforeCaret = value.slice(0, caret);
      const match = beforeCaret.match(/(^|\s)#([a-z0-9_-]*)$/i);
      if (!match) return null;
      const query = normalizeTag(match[2] || "");
      return {
        query,
        start: caret - (match[2] || "").length - 1,
        end: caret
      };
    }

    function renderMenu() {
      if (!suggestions.length) {
        hideMenu();
        return;
      }

      menu.innerHTML = suggestions.map((item, index) => `
        <button class="tag-autocomplete-item${index === activeIndex ? " active" : ""}" type="button" data-tag-option="${escapeHTML(item.tag)}">
          <strong>${escapeHTML(item.displayTag)}</strong>
        </button>
      `).join("");
      menu.classList.add("open");
      positionMenu();
      menu.querySelectorAll("[data-tag-option]").forEach((button, index) => {
        button.addEventListener("mousedown", (event) => {
          event.preventDefault();
          applySuggestion(index);
        });
      });
    }

    function applySuggestion(index) {
      const trigger = currentTrigger();
      const suggestion = suggestions[index];
      if (!trigger || !suggestion) return;
      const value = field.value || "";
      const replacement = `#${suggestion.tag} `;
      field.value = `${value.slice(0, trigger.start)}${replacement}${value.slice(trigger.end)}`;
      const caret = trigger.start + replacement.length;
      field.setSelectionRange(caret, caret);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      hideMenu();
      field.focus();
    }

    async function refreshSuggestions() {
      const trigger = currentTrigger();
      if (!trigger) {
        hideMenu();
        return;
      }

      const version = ++requestVersion;
      const nextSuggestions = await requestTagSuggestions(trigger.query);
      if (version !== requestVersion) {
        return;
      }
      suggestions = nextSuggestions;
      activeIndex = 0;
      renderMenu();
    }

    field.addEventListener("input", refreshSuggestions);
    field.addEventListener("click", refreshSuggestions);
    field.addEventListener("focus", refreshSuggestions);
    field.addEventListener("blur", () => {
      blurTimer = window.setTimeout(hideMenu, 120);
    });
    field.addEventListener("keydown", (event) => {
      if (!menu.classList.contains("open")) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        activeIndex = (activeIndex + 1) % suggestions.length;
        renderMenu();
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
        renderMenu();
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const trigger = currentTrigger();
        if (!trigger) return;
        event.preventDefault();
        applySuggestion(activeIndex);
      }
      if (event.key === "Escape") {
        hideMenu();
      }
    });

    menu.addEventListener("mouseenter", () => {
      if (blurTimer) {
        window.clearTimeout(blurTimer);
        blurTimer = null;
      }
    });
    menu.addEventListener("mouseleave", () => {
      blurTimer = window.setTimeout(hideMenu, 120);
    });
    window.addEventListener("resize", positionMenu, { passive: true });
    window.addEventListener("scroll", positionMenu, { passive: true });
  }

  function readCookie(name) {
    const prefix = `${name}=`;
    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
  }

  function writeCookie(name, value) {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
  }

  function readPreferences() {
    try {
      const raw = readCookie(preferenceKey);
      if (!raw) return { accent: "cobalt", timezone: "system" };
      const parsed = JSON.parse(raw);
      return {
        accent: accents[parsed.accent] ? parsed.accent : "cobalt",
        timezone: timezones.some((item) => item.value === parsed.timezone) ? parsed.timezone : "system"
      };
    } catch {
      return { accent: "cobalt", timezone: "system" };
    }
  }

  function writePreferences(preferences) {
    writeCookie(preferenceKey, JSON.stringify(preferences));
  }

  function applyPreferences(preferences) {
    const palette = accents[preferences.accent] ?? accents.cobalt;
    document.documentElement.style.setProperty("--accent-name", preferences.accent);
    document.documentElement.style.setProperty("--accent", palette.accent);
    document.documentElement.style.setProperty("--accent-strong", palette.strong);
    document.documentElement.style.setProperty("--accent-soft", palette.soft);
    document.documentElement.style.setProperty("--accent-ring", palette.ring);
  }

  function formatDateTime(value, preferences) {
    if (!value) return "No timestamp";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    const formatter = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: preferences.timezone === "system" ? undefined : preferences.timezone
    });

    const label = formatter.format(date);
    const zone = preferences.timezone === "system" ? Intl.DateTimeFormat().resolvedOptions().timeZone : preferences.timezone;
    return `${label} · ${zone}`;
  }

  function renderMetrics(metrics) {
    return "";
  }

  function renderPanel(panel) {
    const hasHeading = Boolean(panel.title || panel.copy || panel.badge);
    return `
      <section class="content-panel ${escapeHTML(panel.span || "")} ${escapeHTML(panel.className || "")}">
        ${hasHeading ? `
          <div class="panel-heading">
            <div>
              ${panel.title ? `<h2 class="panel-title">${escapeHTML(panel.title)}</h2>` : ""}
              ${panel.copy ? `<p class="panel-copy">${escapeHTML(panel.copy)}</p>` : ""}
            </div>
            ${panel.badge ? `<span class="panel-badge">${escapeHTML(panel.badge)}</span>` : ""}
          </div>
        ` : ""}
        ${panel.html}
      </section>
    `;
  }

  function renderEmpty(title, copy) {
    return `<div class="empty-state"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(copy)}</span></div>`;
  }

  function dataCard(title, copy, actions = "") {
    return `
      <article class="data-card">
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(copy)}</p>
        ${actions ? `<div class="panel-actions">${actions}</div>` : ""}
      </article>
    `;
  }

  function actionButton(label, type = "secondary", attributes = "") {
    const className = type === "danger" ? "shell-button-danger" : type === "primary" ? "shell-button" : "shell-button-secondary";
    return `<button class="${className}" type="button" ${attributes}>${escapeHTML(label)}</button>`;
  }

  function sectionToolbar(title, actions = []) {
    return `
      <div class="section-toolbar">
        <div class="section-toolbar-copy">
          <strong>${escapeHTML(title)}</strong>
        </div>
        <div class="inline-actions">${actions.join("")}</div>
      </div>
    `;
  }

  function rowItem(title, subtitle, meta = "", options = {}) {
    return `
      <article class="row-item${options.actions ? "" : " two-col"}">
        <div class="row-main">
          <span class="row-title">${options.titleHTML ? title : escapeHTML(title)}</span>
          <span class="row-subtitle">${options.subtitleHTML ? subtitle : escapeHTML(subtitle)}</span>
        </div>
        ${meta ? `<div class="row-meta">${options.metaHTML ? meta : escapeHTML(meta)}</div>` : ""}
        ${options.actions ? `<div class="row-actions">${options.actions}</div>` : ""}
      </article>
    `;
  }

  function renderUserHoverCard(user, allUsers) {
    if (!user) return "";
    const manager = allUsers.find((item) => item.id === user.managerUserID);
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.displayName || user.email;
    const nickname = user.nickname ? `@${user.nickname}` : "No nickname";
    const department = user.department || "No department";
    const title = user.title || "No title";
    const managerName = manager?.displayName || "No manager";

    return `
      <div class="hover-card-name">${escapeHTML(displayName)}</div>
      <div class="hover-card-nickname">${escapeHTML(nickname)}</div>
      <div class="hover-card-grid">
        <span>Department</span><strong>${escapeHTML(department)}</strong>
        <span>Title</span><strong>${escapeHTML(title)}</strong>
        <span>Manager</span><strong>${escapeHTML(managerName)}</strong>
        <span>Email</span><strong>${escapeHTML(user.email || "No email")}</strong>
      </div>
    `;
  }

  function createShell(config) {
    const root = document.getElementById("app");
    const state = {
      preferences: readPreferences(),
      currentView: config.defaultView || config.navigation[0]?.items[0]?.id || "overview",
      settingsCategory: "appearance",
      userMenuOpen: false,
      session: { authenticated: false, user: null },
      users: []
    };

    applyPreferences(state.preferences);
    ensureFontAwesome();

    root.innerHTML = `
      <div class="shell-root${config.shellClassName ? ` ${escapeHTML(config.shellClassName)}` : ""}">
        <header class="shell-topbar">
          <div class="topbar-brand">
            <img class="brand-mark" src="/shared/app-icon.png" alt="" aria-hidden="true">
            <div class="brand-copy">
              <p class="brand-title">xHarbor:${escapeHTML(config.appName)}</p>
              <p class="brand-subtitle">${escapeHTML(config.appSubtitle)}</p>
            </div>
          </div>

          <div class="topbar-actions">
            <div id="accent-picker" class="accent-picker" aria-label="Accent palette"></div>
            <div id="signed-out-auth" class="auth-inline">
              <select id="login-select" class="shell-select"></select>
              <button id="login-button" class="shell-button" type="button">Sign in</button>
            </div>

            <div id="signed-in-auth" class="user-menu-anchor">
              <button id="user-menu-button" class="user-menu-button" type="button">
                <span id="user-menu-name"></span>
                <span class="user-menu-chevron"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></span>
              </button>
              <div id="user-menu" class="user-menu">
                <div id="user-menu-summary" class="user-menu-summary"></div>
                <button id="menu-settings" class="menu-action" type="button">Settings</button>
                <button id="menu-signout" class="menu-action danger" type="button">Sign out</button>
              </div>
            </div>
          </div>
        </header>

        <div class="shell-body">
          <main class="shell-main">
            <header class="main-header">
              <div class="header-copy">
                <h1 id="view-title"></h1>
                <p id="view-subtitle"></p>
              </div>
              <div id="view-badge" class="header-badge"></div>
            </header>
            <nav id="shell-nav" class="view-switcher"></nav>
            <div id="hero-metrics"></div>
            <div id="view-content" class="content-grid"></div>
          </main>
        </div>
        <footer class="shell-footer">
          <div class="shell-footer-spacer"></div>
          <div class="shell-footer-brand">
            <span class="shell-footer-copy">Powered by</span>
            <img class="shell-footer-logo" src="/shared/go_home.png" alt="Bold Merge">
          </div>
        </footer>
        <div id="user-hover-card" class="user-hover-card"></div>
      </div>
    `;

    const refs = {
      nav: document.getElementById("shell-nav"),
      mainHeader: root.querySelector(".main-header"),
      viewTitle: document.getElementById("view-title"),
      viewSubtitle: document.getElementById("view-subtitle"),
      viewBadge: document.getElementById("view-badge"),
      heroMetrics: document.getElementById("hero-metrics"),
      viewContent: document.getElementById("view-content"),
      loginSelect: document.getElementById("login-select"),
      loginButton: document.getElementById("login-button"),
      signedOutAuth: document.getElementById("signed-out-auth"),
      signedInAuth: document.getElementById("signed-in-auth"),
      accentPicker: document.getElementById("accent-picker"),
      userMenuButton: document.getElementById("user-menu-button"),
      userMenu: document.getElementById("user-menu"),
      userMenuName: document.getElementById("user-menu-name"),
      userMenuSummary: document.getElementById("user-menu-summary"),
      menuSettings: document.getElementById("menu-settings"),
      menuSignout: document.getElementById("menu-signout"),
      userHoverCard: document.getElementById("user-hover-card")
    };
    let userHoverTimer = null;
    let activeUserCardTarget = null;

    function settingsCategories() {
      return [
        { id: "appearance", label: "Appearance", copy: "Accent palette and interface density." },
        { id: "regional", label: "Regional", copy: "Timezone and date rendering." },
        { id: "account", label: "Account", copy: "Session details and authentication state." }
      ];
    }

    function updateNav() {
      const items = config.navigation.flatMap((section) =>
        section.items
          .filter((item) => item.id !== "settings")
          .map((item) => ({ ...item, section: section.section }))
      );

      refs.nav.innerHTML = items.length > 1
        ? items.map((item) => `
            <button class="view-switcher-item${item.id === state.currentView ? " active" : ""}" data-view-id="${item.id}" type="button">
              <strong>${escapeHTML(item.label)}</strong>
              <span>${escapeHTML(item.copy)}</span>
            </button>
          `).join("")
        : "";

      refs.nav.style.display = items.length > 1 ? "flex" : "none";
    }

    function updateAccentPicker() {
      refs.accentPicker.innerHTML = Object.entries(accents).map(([value, accent]) => `
        <button
          class="accent-swatch${value === state.preferences.accent ? " active" : ""}"
          type="button"
          data-accent-value="${value}"
          aria-label="${escapeHTML(accent.label)}"
          title="${escapeHTML(accent.label)}"
          style="--swatch:${accent.accent};"
        ></button>
      `).join("");

      refs.accentPicker.querySelectorAll("[data-accent-value]").forEach((button) => {
        button.addEventListener("click", async () => {
          state.preferences.accent = button.dataset.accentValue;
          writePreferences(state.preferences);
          applyPreferences(state.preferences);
          updateAccentPicker();
          if (state.currentView === "settings") {
            await renderView();
          }
        });
      });
    }

    function updateUserMenu() {
      refs.userMenu.classList.toggle("open", state.userMenuOpen);
      if (!state.session.authenticated) {
        refs.signedOutAuth.style.display = "flex";
        refs.signedInAuth.style.display = "none";
        refs.loginSelect.innerHTML = state.users
          .map((user) => `<option value="${user.id}">${escapeHTML(user.displayName)}</option>`)
          .join("");
        refs.loginSelect.disabled = !state.users.length;
        refs.loginButton.disabled = !state.users.length;
        return;
      }

      refs.signedOutAuth.style.display = "none";
      refs.signedInAuth.style.display = "block";
      refs.userMenuName.textContent = state.session.user.displayName;
      refs.userMenuSummary.textContent = state.session.expiresAt
        ? `Signed in until ${formatDateTime(state.session.expiresAt, state.preferences)}`
        : "Signed in";
    }

    function setHeader(title, subtitle, badge = "", options = {}) {
      refs.viewTitle.textContent = title;
      refs.viewSubtitle.textContent = subtitle;
      refs.viewBadge.textContent = badge;
      refs.viewBadge.style.display = badge ? "inline-flex" : "none";
      refs.mainHeader.classList.toggle("hidden", Boolean(options.hidden));
    }

    function setMetrics(metrics) {
      refs.heroMetrics.innerHTML = renderMetrics(metrics);
      refs.heroMetrics.style.display = "none";
    }

    function setPanels(panels) {
      refs.viewContent.innerHTML = panels.map(renderPanel).join("");
    }

    function renderSettingsPanels() {
      const categories = settingsCategories();
      const currentCategory = state.settingsCategory;
      const selectedTimezone = state.preferences.timezone === "system"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : state.preferences.timezone;

      let detailPanel = null;

      if (currentCategory === "appearance") {
        detailPanel = {
          span: "span-8",
          title: "Appearance",
          copy: "Choose the shared accent palette used across all xHarbor web apps.",
          html: `
            <div class="settings-section">
              <label class="settings-field">
                <span>Accent palette</span>
                <select id="settings-accent" class="shell-select">
                  ${Object.entries(accents).map(([value, accent]) => `<option value="${value}"${value === state.preferences.accent ? " selected" : ""}>${escapeHTML(accent.label)}</option>`).join("")}
                </select>
              </label>
              <div class="settings-preview">
                <span class="preview-chip">${escapeHTML(accents[state.preferences.accent].label)}</span>
                <p>The accent is used for active navigation, buttons, focus states, and highlights.</p>
              </div>
            </div>
          `
        };
      }

      if (currentCategory === "regional") {
        detailPanel = {
          span: "span-8",
          title: "Regional",
          copy: "Control how timestamps are rendered in this browser.",
          html: `
            <div class="settings-section">
              <label class="settings-field">
                <span>Timezone</span>
                <select id="settings-timezone" class="shell-select">
                  ${timezones.map((item) => `<option value="${item.value}"${item.value === state.preferences.timezone ? " selected" : ""}>${escapeHTML(item.label)}</option>`).join("")}
                </select>
              </label>
              <div class="settings-preview">
                <span class="preview-chip">${escapeHTML(selectedTimezone)}</span>
                <p>All dates across the web apps use this selection immediately after change.</p>
              </div>
            </div>
          `
        };
      }

      if (currentCategory === "account") {
        detailPanel = {
          span: "span-8",
          title: "Account",
          copy: "Session details and access state for the current browser session.",
          html: `
            <div class="settings-section">
              ${state.session.authenticated
                ? `
                  <div class="settings-card">
                    <h3>${escapeHTML(state.session.user.displayName)}</h3>
                    <p>${escapeHTML(state.session.user.email || state.session.user.id || "")}</p>
                  </div>
                  <div class="settings-card">
                    <h3>Session</h3>
                    <p>${escapeHTML(state.session.expiresAt ? formatDateTime(state.session.expiresAt, state.preferences) : "No expiry metadata")}</p>
                  </div>
                  <div class="panel-actions">
                    <button id="settings-signout" class="shell-button-danger" type="button">Sign out</button>
                  </div>
                `
                : renderEmpty("Signed out", "Use the sign-in control in the top-right corner to authenticate.")}
            </div>
          `
        };
      }

      return [
        {
          span: "span-4",
          title: "Categories",
          copy: "Settings are grouped by category, similar to browser preferences.",
          html: `
            <div class="settings-categories">
              ${categories.map((category) => `
                <button class="settings-nav-item${category.id === currentCategory ? " active" : ""}" data-settings-category="${category.id}" type="button">
                  <strong>${escapeHTML(category.label)}</strong>
                  <span>${escapeHTML(category.copy)}</span>
                </button>
              `).join("")}
            </div>
          `
        },
        ...[detailPanel].filter(Boolean)
      ];
    }

    async function refreshAuthState() {
      state.users = await config.loadUsers().catch(() => []);
      state.session = await config.loadSession().catch(() => ({ authenticated: false, user: null }));
      updateUserMenu();
    }

    async function renderView() {
      updateNav();
      updateAccentPicker();
      updateUserMenu();

      if (state.currentView === "settings") {
        setHeader("Settings", "A separate preferences area for appearance, regional behavior, and account state.", settingsCategories().find((item) => item.id === state.settingsCategory)?.label || "Settings");
        setMetrics([]);
        setPanels(renderSettingsPanels());

        document.getElementById("settings-accent")?.addEventListener("change", async (event) => {
          state.preferences.accent = event.target.value;
          writePreferences(state.preferences);
          applyPreferences(state.preferences);
          await renderView();
        });

        document.getElementById("settings-timezone")?.addEventListener("change", async (event) => {
          state.preferences.timezone = event.target.value;
          writePreferences(state.preferences);
          await renderView();
        });

        document.querySelectorAll("[data-settings-category]").forEach((button) => {
          button.addEventListener("click", async () => {
            state.settingsCategory = button.dataset.settingsCategory;
            await renderView();
          });
        });

        document.getElementById("settings-signout")?.addEventListener("click", async () => {
          await config.onLogout();
          state.userMenuOpen = false;
          await refresh();
        });
        return;
      }

      await config.renderView({
        state,
        setHeader,
        setMetrics,
        setPanels,
        renderEmpty,
        dataCard,
        actionButton,
        renderPanel,
        escapeHTML,
        formatDateTime: (value) => formatDateTime(value, state.preferences),
        refresh: async () => {
          await refreshAuthState();
          await renderView();
        }
      });
    }

    async function refresh() {
      await refreshAuthState();
      await renderView();
    }

    function hideUserCard() {
      if (userHoverTimer) {
        window.clearTimeout(userHoverTimer);
        userHoverTimer = null;
      }
      activeUserCardTarget = null;
      refs.userHoverCard.classList.remove("open");
      refs.userHoverCard.innerHTML = "";
    }

    function showUserCard(target) {
      const userID = target.dataset.userId;
      const user = state.users.find((item) => item.id === userID);
      if (!user) return;
      activeUserCardTarget = target;
      refs.userHoverCard.innerHTML = renderUserHoverCard(user, state.users);
      refs.userHoverCard.classList.add("open");
      const rect = target.getBoundingClientRect();
      refs.userHoverCard.style.left = `${Math.min(rect.left, window.innerWidth - 304)}px`;
      refs.userHoverCard.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 180)}px`;
    }

    refs.viewContent.addEventListener("mouseover", (event) => {
      const target = event.target.closest("[data-user-id]");
      if (!target) return;
      if (activeUserCardTarget === target) return;
      hideUserCard();
      userHoverTimer = window.setTimeout(() => showUserCard(target), 450);
    });

    refs.viewContent.addEventListener("mouseout", (event) => {
      const target = event.target.closest("[data-user-id]");
      if (!target) return;
      if (event.relatedTarget && (event.relatedTarget.closest("[data-user-id]") === target || event.relatedTarget.closest(".user-hover-card"))) {
        return;
      }
      hideUserCard();
    });

    refs.userHoverCard.addEventListener("mouseleave", hideUserCard);
    window.addEventListener("scroll", hideUserCard, { passive: true });

    refs.viewContent.addEventListener("click", (event) => {
      const tagLink = event.target.closest(".tag-link");
      if (!tagLink) return;
      event.stopPropagation();
    }, true);

    refs.nav.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-view-id]");
      if (!button) return;
      state.currentView = button.dataset.viewId;
      state.userMenuOpen = false;
      await renderView();
    });

    refs.loginButton.addEventListener("click", async () => {
      if (!refs.loginSelect.value) return;
      await config.onLogin(refs.loginSelect.value);
      await refresh();
    });

    refs.userMenuButton.addEventListener("click", () => {
      state.userMenuOpen = !state.userMenuOpen;
      updateUserMenu();
    });

    refs.menuSettings.addEventListener("click", async () => {
      state.currentView = "settings";
      state.userMenuOpen = false;
      await renderView();
    });

    refs.menuSignout.addEventListener("click", async () => {
      await config.onLogout();
      state.userMenuOpen = false;
      await refresh();
    });

    document.addEventListener("click", (event) => {
      if (!state.userMenuOpen) return;
      if (event.target.closest(".user-menu-anchor")) return;
      state.userMenuOpen = false;
      updateUserMenu();
    });

    return {
      refresh,
      getState: () => state
    };
  }

  window.XHarborShell = {
    accents,
    timezones,
    escapeHTML,
    normalizeTag,
    readLocationState,
    syncLocationState,
    buildTagSearchURL,
    renderTagText,
    renderAvatar,
    renderUserRef,
    requestJSON,
    loadSession,
    loadUsers,
    createSession,
    destroySession,
    avatarInitials,
    attachTagAutocomplete,
    createShell,
    formatDateTime,
    renderEmpty,
    dataCard,
    actionButton,
    sectionToolbar,
    rowItem
  };
})();
