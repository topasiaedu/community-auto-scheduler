import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTransientWaDisconnectError } from "./transientWaError.js";

describe("isTransientWaDisconnectError", () => {
  it("matches failed to get group members with info query disconnect", () => {
    assert.equal(
      isTransientWaDisconnectError(
        "failed to get group members: websocket disconnected before info query returned response",
      ),
      true,
    );
  });

  it("matches websocket disconnected before info query alone", () => {
    assert.equal(
      isTransientWaDisconnectError("websocket disconnected before info query returned response"),
      true,
    );
  });

  it("matches disconnected + info query returned response phrasing", () => {
    assert.equal(
      isTransientWaDisconnectError("something disconnected while info query returned response"),
      true,
    );
  });

  it("is case-insensitive", () => {
    assert.equal(
      isTransientWaDisconnectError(
        "Failed To Get Group Members: Websocket Disconnected Before Info Query Returned Response",
      ),
      true,
    );
  });

  it("excludes before message send returned (duplicate risk)", () => {
    assert.equal(
      isTransientWaDisconnectError(
        "websocket disconnected before message send returned response",
      ),
      false,
    );
  });

  it("excludes unrelated send failures", () => {
    assert.equal(isTransientWaDisconnectError("Storage download failed: exceed_egress_quota"), false);
    assert.equal(isTransientWaDisconnectError("WhatsApp client is not initialized"), false);
    assert.equal(isTransientWaDisconnectError(""), false);
  });
});
