import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WaStatusSnapshot } from "../wa/wa-manager.js";
import {
  commitWaLinkDecision,
  decideWaLinkAlert,
  formatAlertWhenMyt,
  formatWaDownAlert,
  formatWaUpAlert,
  INITIAL_WA_LINK_ALERT_STATE,
  shouldWatchWaSession,
  type WaLinkObservation,
} from "./waLinkAlert.js";

const GRACE_MS = 180_000;

/**
 * A not-ready observation. Tests override the fields that matter.
 */
function observation(overrides: Partial<WaLinkObservation>): WaLinkObservation {
  return {
    nowMs: 0,
    sendReady: false,
    loggedOut: false,
    pairing: false,
    lastError: null,
    graceMs: GRACE_MS,
    ...overrides,
  };
}

function idleSnapshot(): WaStatusSnapshot {
  return {
    state: "disconnected",
    hasQr: false,
    pairing: false,
    hasClient: false,
    startWorkInFlight: false,
    lastError: null,
    bootPhase: null,
    loggedOut: false,
  };
}

describe("formatAlertWhenMyt", () => {
  it("formats 11:40 Malaysia time on 12 Oct 2026", () => {
    const label = formatAlertWhenMyt(Date.parse("2026-10-12T03:40:00.000Z"));
    assert.equal(label, "12 Oct 2026, 11:40 MYT");
  });
});

describe("format alert text", () => {
  it("builds the down and back messages", () => {
    const down = formatWaDownAlert({
      projectName: "Show Up",
      sinceMs: Date.parse("2026-10-12T03:40:00.000Z"),
      reason: "logged out — scan a new QR",
    });
    assert.match(down, /^🔴 WhatsApp is not connected/);
    assert.equal(down.includes("[NMCAS]"), false);
    assert.match(down, /Project: Show Up/);
    assert.match(down, /Since: 12 Oct 2026, 11:40 MYT/);
    assert.match(down, /Reason: logged out — scan a new QR/);
    assert.equal(formatWaUpAlert("Show Up"), "🟢 WhatsApp is connected again\nProject: Show Up");
  });
});

describe("shouldWatchWaSession", () => {
  it("ignores a manager that was never started", () => {
    assert.equal(shouldWatchWaSession(idleSnapshot()), false);
  });

  it("watches a logged-out session even with no client", () => {
    assert.equal(shouldWatchWaSession({ ...idleSnapshot(), loggedOut: true }), true);
  });
});

describe("decideWaLinkAlert", () => {
  it("starts the clock and stays quiet inside the grace period", () => {
    const started = decideWaLinkAlert(INITIAL_WA_LINK_ALERT_STATE, observation({ nowMs: 1_000 }));
    assert.equal(started.action, "none");
    if (started.action !== "none") {
      return;
    }
    assert.equal(started.next.downSinceMs, 1_000);

    const stillWaiting = decideWaLinkAlert(
      started.next,
      observation({ nowMs: 1_000 + GRACE_MS - 1 }),
    );
    assert.equal(stillWaiting.action, "none");
  });

  it("alerts once when the grace period has elapsed", () => {
    const started = decideWaLinkAlert(INITIAL_WA_LINK_ALERT_STATE, observation({ nowMs: 1_000 }));
    if (started.action !== "none") {
      assert.fail("first sighting should only start the clock");
    }
    const due = decideWaLinkAlert(started.next, observation({ nowMs: 1_000 + GRACE_MS }));
    assert.equal(due.action, "alert_down");
    if (due.action !== "alert_down") {
      return;
    }
    assert.equal(due.sinceMs, 1_000);
    assert.equal(due.reason, "still not connected");
    assert.equal(due.next.downAlertDelivered, true);

    const repeat = decideWaLinkAlert(due.next, observation({ nowMs: 1_000 + GRACE_MS + 30_000 }));
    assert.equal(repeat.action, "none");
  });

  it("alerts immediately on logout", () => {
    const decision = decideWaLinkAlert(
      INITIAL_WA_LINK_ALERT_STATE,
      observation({
        nowMs: 5_000,
        loggedOut: true,
        lastError: "WhatsApp logged out — scan a new QR",
      }),
    );
    assert.equal(decision.action, "alert_down");
    if (decision.action !== "alert_down") {
      return;
    }
    assert.equal(decision.reason, "WhatsApp logged out — scan a new QR");
    assert.equal(decision.sinceMs, 5_000);
  });

  it("alerts immediately when the client is outdated", () => {
    const decision = decideWaLinkAlert(
      INITIAL_WA_LINK_ALERT_STATE,
      observation({
        lastError: "WhatsApp rejected this app version (client outdated).",
      }),
    );
    assert.equal(decision.action, "alert_down");
  });

  it("pauses the grace clock while a QR is on screen", () => {
    const started = decideWaLinkAlert(INITIAL_WA_LINK_ALERT_STATE, observation({ nowMs: 1_000 }));
    if (started.action !== "none") {
      assert.fail("first sighting should only start the clock");
    }
    const paused = decideWaLinkAlert(
      started.next,
      observation({ nowMs: 1_000 + GRACE_MS, pairing: true }),
    );
    assert.equal(paused.action, "none");
    if (paused.action !== "none") {
      return;
    }
    assert.equal(paused.next.downSinceMs, null);

    const afterQr = decideWaLinkAlert(paused.next, observation({ nowMs: 9_000_000 }));
    assert.equal(afterQr.action, "none");
    if (afterQr.action !== "none") {
      return;
    }
    assert.equal(afterQr.next.downSinceMs, 9_000_000);
  });

  it("sends connected-again only after a delivered down alert", () => {
    const down = decideWaLinkAlert(
      INITIAL_WA_LINK_ALERT_STATE,
      observation({ nowMs: 5_000, loggedOut: true }),
    );
    if (down.action !== "alert_down") {
      assert.fail("logout should alert");
    }
    const back = decideWaLinkAlert(down.next, observation({ nowMs: 8_000, sendReady: true }));
    assert.equal(back.action, "alert_up");
    if (back.action !== "alert_up") {
      return;
    }
    assert.equal(back.next.downAlertDelivered, false);

    const quietReady = decideWaLinkAlert(
      INITIAL_WA_LINK_ALERT_STATE,
      observation({ nowMs: 8_000, sendReady: true }),
    );
    assert.equal(quietReady.action, "none");
  });
});

describe("commitWaLinkDecision", () => {
  it("keeps the previous state when the down send fails", () => {
    const previous = INITIAL_WA_LINK_ALERT_STATE;
    const decision = decideWaLinkAlert(
      previous,
      observation({ nowMs: 5_000, loggedOut: true, lastError: "logged out" }),
    );
    const committed = commitWaLinkDecision(previous, decision, false);
    assert.deepEqual(committed, previous);

    const retried = decideWaLinkAlert(committed, observation({ nowMs: 6_000, loggedOut: true }));
    assert.equal(retried.action, "alert_down");
  });

  it("records delivery only after Telegram accepts the down message", () => {
    const previous = { downSinceMs: 1_000, downAlertDelivered: false };
    const decision = decideWaLinkAlert(previous, observation({ nowMs: 1_000 + GRACE_MS }));
    const committed = commitWaLinkDecision(previous, decision, true);
    assert.equal(committed.downAlertDelivered, true);
  });
});
