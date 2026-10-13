import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStatusOnlyGroup, STATUS_ONLY_GROUP_JID } from "./statusOnlyGroup.js";

describe("isStatusOnlyGroup", () => {
  it("matches only the reserved status-only id", () => {
    assert.equal(isStatusOnlyGroup(STATUS_ONLY_GROUP_JID), true);
    assert.equal(isStatusOnlyGroup(` ${STATUS_ONLY_GROUP_JID} `), true);
    assert.equal(isStatusOnlyGroup("120363000000000000@g.us"), false);
  });
});
