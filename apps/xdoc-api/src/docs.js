import { slugify } from "@xharbor/contracts";

function nonEmpty(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeContent(value) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

function nextVersion(state, pageID) {
  return state.revisions.filter((revision) => revision.pageID === pageID).length + 1;
}

function makePageID(state, title) {
  const base = `page-${slugify(title || "untitled-page") || "untitled-page"}`;
  let candidate = base;
  let suffix = 2;

  while (state.pages.some((page) => page.id === candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function makeSlug(state, title, excludingPageID = null) {
  const base = slugify(title || "untitled-page") || "untitled-page";
  let candidate = base;
  let suffix = 2;

  while (state.pages.some((page) => page.slug === candidate && page.id !== excludingPageID)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function findPage(state, pageID) {
  return state.pages.find((page) => page.id === pageID) ?? null;
}

function assertPageExists(state, pageID) {
  const page = findPage(state, pageID);
  if (!page) {
    throw new Error(`Unknown page: ${pageID}`);
  }
  return page;
}

function assertParentIsValid(state, pageID, parentPageID) {
  if (!parentPageID) {
    return null;
  }

  if (pageID && parentPageID === pageID) {
    throw new Error("Page cannot be its own parent.");
  }

  const parent = assertPageExists(state, parentPageID);
  let current = parent;
  while (current?.parentPageID) {
    if (current.parentPageID === pageID) {
      throw new Error("Page tree cannot contain cycles.");
    }
    current = findPage(state, current.parentPageID);
  }

  return parent.id;
}

function createRevision(state, page, authorUserID, summary, createdAt) {
  const version = nextVersion(state, page.id);
  const revision = {
    id: `rev-${page.id}-${version}`,
    pageID: page.id,
    version,
    title: page.title,
    slug: page.slug,
    parentPageID: page.parentPageID,
    content: page.content,
    authorUserID,
    createdAt,
    summary: nonEmpty(summary, version === 1 ? "Page created." : "Page updated.")
  };
  state.revisions.push(revision);
  return revision;
}

export function listPageRevisions(state, pageID) {
  return state.revisions
    .filter((revision) => revision.pageID === pageID)
    .sort((left, right) => right.version - left.version);
}

export function buildPageTree(pages) {
  const nodes = pages
    .slice()
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((page) => ({ ...page, children: [] }));
  const byID = new Map(nodes.map((node) => [node.id, node]));
  const roots = [];

  for (const node of nodes) {
    if (node.parentPageID && byID.has(node.parentPageID)) {
      byID.get(node.parentPageID).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function createPage(state, payload, actorUserID) {
  const now = new Date().toISOString();
  const title = nonEmpty(payload.title, "Untitled Page");
  const parentPageID = assertParentIsValid(state, null, payload.parentPageID ?? null);
  const page = {
    id: makePageID(state, title),
    slug: makeSlug(state, title),
    title,
    parentPageID,
    content: normalizeContent(payload.content),
    createdAt: now,
    updatedAt: now,
    createdByUserID: actorUserID,
    updatedByUserID: actorUserID
  };

  state.pages.push(page);
  createRevision(state, page, actorUserID, payload.summary || "Page created.", now);
  return page;
}

export function updatePage(state, pageID, payload, actorUserID) {
  const page = assertPageExists(state, pageID);
  const now = new Date().toISOString();
  const title = nonEmpty(payload.title, page.title);
  const parentPageID = assertParentIsValid(state, page.id, payload.parentPageID === undefined ? page.parentPageID : payload.parentPageID);

  page.title = title;
  page.slug = makeSlug(state, title, page.id);
  page.parentPageID = parentPageID;
  page.content = normalizeContent(payload.content ?? page.content);
  page.updatedAt = now;
  page.updatedByUserID = actorUserID;

  createRevision(state, page, actorUserID, payload.summary || "Page updated.", now);
  return page;
}
