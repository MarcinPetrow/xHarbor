import test from "node:test";
import assert from "node:assert/strict";
import { createDemoDocsState } from "@xharbor/contracts";
import { buildPageTree, createPage, listPageRevisions, updatePage } from "../src/docs.js";

test("createPage appends revision and stable identifiers", () => {
  const state = createDemoDocsState();
  const page = createPage(state, { title: "Architecture Notes", parentPageID: "page-engineering-handbook", content: "Hello" }, "user-marcin");

  assert.equal(page.slug, "architecture-notes");
  assert.equal(page.parentPageID, "page-engineering-handbook");
  assert.equal(state.revisions.at(-1).pageID, page.id);
  assert.equal(state.revisions.at(-1).version, 1);
});

test("updatePage appends next revision", () => {
  const state = createDemoDocsState();
  const page = updatePage(
    state,
    "page-release-runbook",
    { title: "Release Runbook", content: "Updated body", summary: "Clarified rollout." },
    "user-anna"
  );

  assert.equal(page.content, "Updated body");
  assert.equal(listPageRevisions(state, "page-release-runbook")[0].summary, "Clarified rollout.");
  assert.equal(listPageRevisions(state, "page-release-runbook")[0].version, 3);
});

test("updatePage rejects cycles in page tree", () => {
  const state = createDemoDocsState();
  assert.throws(
    () => updatePage(state, "page-engineering-handbook", { parentPageID: "page-release-runbook" }, "user-marcin"),
    /cannot contain cycles/i
  );
});

test("buildPageTree nests child pages under parent", () => {
  const state = createDemoDocsState();
  const tree = buildPageTree(state.pages);

  assert.equal(tree.length, 1);
  assert.equal(tree[0].children.length, 2);
});
