import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWaConnectionStatusSnapshot,
  computeReconnectDelayMs,
  DEFAULT_WA_GROUPS_REFRESH_INTERVAL_MS,
} from "../wa/wa-manager.js";

describe("wa always-on helpers", () => {
  it("computeReconnectDelayMs uses exponential backoff with cap", () => {
    assert.equal(computeReconnectDelayMs(1), 1_000);
    assert.equal(computeReconnectDelayMs(2), 2_000);
    // 1_000 * 2^(6-1) = 32_000 (attempt=6)
    assert.equal(computeReconnectDelayMs(6), 32_000);
    // 1_000 * 2^(7-1) = 64_000 → capped at 60_000
    assert.equal(computeReconnectDelayMs(7), 60_000);
  });

  it("computeReconnectDelayMs normalizes non-positive attempts", () => {
    assert.equal(computeReconnectDelayMs(0), 1_000);
    assert.equal(computeReconnectDelayMs(-10), 1_000);
  });

  it("buildWaConnectionStatusSnapshot overrides uiState when QR is present", () => {
    assert.deepEqual(buildWaConnectionStatusSnapshot("connected", true), {
      state: "connecting",
      hasQr: true,
    });

    assert.deepEqual(buildWaConnectionStatusSnapshot("disconnected", false), {
      state: "disconnected",
      hasQr: false,
    });
  });

  it("DEFAULT_WA_GROUPS_REFRESH_INTERVAL_MS is three minutes", () => {
    assert.equal(DEFAULT_WA_GROUPS_REFRESH_INTERVAL_MS, 3 * 60_000);
  });
});

