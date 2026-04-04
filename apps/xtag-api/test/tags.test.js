import test from "node:test";
import assert from "node:assert/strict";
import { buildTagIndex, groupItemsBySource, queryTagIndex } from "../src/tags.js";

test("buildTagIndex aggregates tags across sources", () => {
  const index = buildTagIndex([
    {
      source: "xbacklog",
      items: [
        { source: "xbacklog", kind: "task", id: "task-1", title: "Auth task", tags: ["auth", "platform"], matches: [] }
      ]
    },
    {
      source: "xtalk",
      items: [
        { source: "xtalk", kind: "room", id: "room-1", title: "Platform room", tags: ["platform"], matches: [] }
      ]
    }
  ]);

  assert.equal(index.tags[0].tag, "platform");
  assert.equal(index.tags[0].itemCount, 2);
  assert.equal(index.tags.find((tag) => tag.tag === "auth").itemCount, 1);
});

test("queryTagIndex is case insensitive and strips hashes", () => {
  const index = buildTagIndex([
    {
      source: "xdoc",
      items: [
        { source: "xdoc", kind: "page", id: "page-1", title: "Release page", tags: ["release"], matches: [] }
      ]
    }
  ]);

  const result = queryTagIndex(index, "#Release");
  assert.equal(result.query, "release");
  assert.equal(result.items.length, 1);
  assert.equal(result.tags.length, 1);
});

test("buildTagIndex collapses aliased tags into canonical tag", () => {
  const index = buildTagIndex([
    {
      source: "xtalk",
      items: [
        { source: "xtalk", kind: "room", id: "room-1", title: "Platform room", tags: ["auth-ui"], matches: [] }
      ]
    }
  ], { "auth-ui": "auth" });

  assert.equal(index.tags[0].tag, "auth");
  assert.deepEqual(index.tags[0].aliases, ["auth-ui"]);
  assert.deepEqual(index.items[0].tags, ["auth"]);
});

test("queryTagIndex resolves alias query to canonical tag", () => {
  const index = buildTagIndex([
    {
      source: "xdoc",
      items: [
        { source: "xdoc", kind: "page", id: "page-1", title: "Auth page", tags: ["auth"], matches: [] }
      ]
    }
  ], { "auth-ui": "auth" });

  const result = queryTagIndex(index, "#auth-ui", { "auth-ui": "auth" });
  assert.equal(result.query, "auth");
  assert.equal(result.items.length, 1);
  assert.equal(result.tags.length, 1);
});

test("groupItemsBySource keeps platform source order", () => {
  const grouped = groupItemsBySource([
    { source: "xdoc", id: "page-1" },
    { source: "xtalk", id: "room-1" },
    { source: "xbacklog", id: "task-1" }
  ]);

  assert.deepEqual(grouped.map((entry) => entry.source), ["xbacklog", "xtalk", "xdoc"]);
});
