/**
 * Pure pairing decisions for WhatsApp QR linking.
 *
 * whatsmeow-node binds the Go store at `init()`. If a stored session is unusable, wiping
 * SQLite/Postgres while reusing the same client leaves the subprocess holding the old store
 * and `getQRChannel()` never emits `qr` — the UI stays on "Generating QR…" forever.
 */

/** How many failed logged-in reconnect waits before forcing a wipe + QR re-pair. */
export const WA_RECONNECT_FAILURES_BEFORE_QR_REPAIR = 3;

export type WaPairingAfterInitPlan = "connect_stored_session" | "open_qr_on_current_client";

export type WaPairingAfterDeadSessionPlan = "recreate_client_then_open_qr";

export type WaPairingAfterLoggedInWaitPlan = "schedule_reconnect" | "recreate_client_then_open_qr";

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
 * After `isLoggedIn()` was true but `waitForConnection` failed.
 * Retry a few times; then force wipe + fresh QR so the UI is not stuck on "Connecting…".
 */
export function planPairingAfterLoggedInWaitFailed(
  consecutiveFailures: number,
): WaPairingAfterLoggedInWaitPlan {
  const failures =
    typeof consecutiveFailures === "number" && Number.isFinite(consecutiveFailures)
      ? Math.max(0, Math.floor(consecutiveFailures))
      : 0;
  if (failures >= WA_RECONNECT_FAILURES_BEFORE_QR_REPAIR) {
    return "recreate_client_then_open_qr";
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
