/**
 * Pure pairing decisions for WhatsApp QR linking.
 *
 * whatsmeow-node binds the Go store at `init()`. If a stored session is unusable, wiping
 * SQLite/Postgres while reusing the same client leaves the subprocess holding the old store
 * and `getQRChannel()` never emits `qr` — the UI stays on "Generating QR…" forever.
 */

export type WaPairingAfterInitPlan = "connect_stored_session" | "open_qr_on_current_client";

export type WaPairingAfterDeadSessionPlan = "recreate_client_then_open_qr";

/**
 * A paired device that misses its reconnect wait stays paired.
 * A new QR would call logout and make the phone show "connection failed".
 */
export type WaPairingAfterLoggedInWaitPlan = "schedule_reconnect";

/**
 * After `client.init()`, choose stored-session connect vs first-time QR on this client.
 */
export function planPairingAfterInit(initJid: string | undefined): WaPairingAfterInitPlan {
  if (typeof initJid === "string" && initJid.trim().length > 0) {
    return "connect_stored_session";
  }
  return "open_qr_on_current_client";
}

/**
 * When a stored session exists but is not logged in / connect failed the login check.
 * Always recreate — never call `getQRChannel()` on the client that already `init()`'d that store.
 */
export function planPairingAfterDeadStoredSession(): WaPairingAfterDeadSessionPlan {
  return "recreate_client_then_open_qr";
}

/**
 * After a saved login misses `waitForConnection`.
 * Always retry that same login. Failure count is accepted so callers can log it;
 * it must not switch the plan to a new QR.
 */
export function planPairingAfterLoggedInWaitFailed(
  consecutiveFailures: number,
): WaPairingAfterLoggedInWaitPlan {
  if (typeof consecutiveFailures !== "number" || !Number.isFinite(consecutiveFailures)) {
    return "schedule_reconnect";
  }
  return "schedule_reconnect";
}

/**
 * Simulated boot step used by unit tests to catch the "wipe then getQRChannel on same client" bug.
 * Production `WaManager.boot` must follow the same order.
 */
export type SimulatedPairingClient = {
  id: number;
  initJid: string | undefined;
  closed: boolean;
  getQRChannelCalls: number;
};

export type SimulatedPairingResult = {
  qrClientId: number;
  createdClientCount: number;
  wiped: boolean;
};

/**
 * Dead-session pairing sequence: wipe + **new** client before `getQRChannel`.
 * A buggy implementation would call `getQRChannel` on `stale.id` after wipe.
 */
export function simulateDeadSessionQrPairing(stale: SimulatedPairingClient): SimulatedPairingResult {
  const plan = planPairingAfterDeadStoredSession();
  if (plan !== "recreate_client_then_open_qr") {
    throw new Error(`Unexpected plan: ${plan}`);
  }
  stale.closed = true;
  const fresh: SimulatedPairingClient = {
    id: stale.id + 1,
    initJid: undefined,
    closed: false,
    getQRChannelCalls: 0,
  };
  fresh.getQRChannelCalls += 1;
  return {
    qrClientId: fresh.id,
    createdClientCount: 2,
    wiped: true,
  };
}
