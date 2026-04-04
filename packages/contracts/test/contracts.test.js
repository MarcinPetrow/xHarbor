import test from "node:test";
import assert from "node:assert/strict";
import { extractTags, normalizeTag } from "../src/index.js";

test("normalizeTag strips leading hash and lowercases value", () => {
  assert.equal(normalizeTag("#Platform"), "platform");
  assert.equal(normalizeTag("##Release_Readiness"), "release_readiness");
});

test("extractTags returns unique normalized hashtags", () => {
  assert.deepEqual(
    extractTags("Coordinate #Platform rollout with #platform owners and #Release today."),
    ["platform", "release"]
  );
});
