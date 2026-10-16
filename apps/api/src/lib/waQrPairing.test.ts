import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  planPairingAfterDeadStoredSession,
  planPairingAfterInit,
  planPairingAfterLoggedInWaitFailed,
  simulateDeadSessionQrPairing,
} from "./waQrPairing.js";

describe("waQrPairing", () => {
  it("opens QR on the current client when init has no jid", () => {
    assert.equal(planPairingAfterInit(undefined), "open_qr_on_current_client");
    assert.equal(planPairingAfterInit(""), "open_qr_on_current_client");
    assert.equal(planPairingAfterInit("   "), "open_qr_on_current_client");
  });

  it("connects stored session when init returns a jid", () => {
    assert.equal(planPairingAfterInit("123@s.whatsapp.net"), "connect_stored_session");
  });

  it("requires a fresh client after a dead stored session (never getQRChannel on wiped client)", () => {
    assert.equal(planPairingAfterDeadStoredSession(), "recreate_client_then_open_qr");

    const stale = {
      id: 1,
      initJid: "123@s.whatsapp.net",
      closed: false,
      getQRChannelCalls: 0,
    };
    const result = simulateDeadSessionQrPairing(stale);

    // Regression: UI stuck on "Generating QR…" when getQRChannel ran on the wiped client.
    assert.equal(stale.closed, true);
    assert.notEqual(result.qrClientId, stale.id);
    assert.equal(result.wiped, true);
    assert.equal(result.createdClientCount, 2);
  });

  it("keeps the saved login after repeated reconnect waits", () => {
    assert.equal(planPairingAfterLoggedInWaitFailed(1), "schedule_reconnect");
    assert.equal(planPairingAfterLoggedInWaitFailed(2), "schedule_reconnect");
    assert.equal(planPairingAfterLoggedInWaitFailed(3), "schedule_reconnect");
    assert.equal(planPairingAfterLoggedInWaitFailed(Number.NaN), "schedule_reconnect");
  });
});
