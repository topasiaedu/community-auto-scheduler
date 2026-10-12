/**
 * Telegram reminder when a warm WhatsApp session is down.
 *
 * A normal disconnect is silent until it has stayed not send-ready for the grace
 * period (default 3 minutes), because WhatsApp reconnects on its own.
 * Logout and a "client outdated" error alert on the first check.
 * One down message per outage. One "connected again" message only after that
 * down message was accepted by Telegram.
 */

import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import type { WaConnectionPool } from "../wa/wa-pool.js";
import type { WaStatusSnapshot } from "../wa/wa-manager.js";
import { sendTelegramText } from "./telegramNotify.js";

/** How often the warm sessions are checked. */
const POLL_MS = 30_000;

/** Let the always-on warm boot start before the first check. */
const FIRST_DELAY_MS = 10_000;

const MYT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Cap a reason line so a huge engine error cannot blow the Telegram message. */
const MAX_REASON_CHARS = 300;

/**
 * Per-project memory. `downAlertDelivered` becomes true only after Telegram accepts the down text.
 */
export type WaLinkAlertState = {
  downSinceMs: number | null;
  downAlertDelivered: boolean;
};

export const INITIAL_WA_LINK_ALERT_STATE: WaLinkAlertState = {
  downSinceMs: null,
  downAlertDelivered: false,
};

/** One observation of a session that is already loaded in this process. */
export type WaLinkObservation = {
  nowMs: number;
  sendReady: boolean;
  loggedOut: boolean;
  /** True while a QR is on screen. The grace clock stays paused. */
  pairing: boolean;
  lastError: string | null;
  graceMs: number;
};

export type WaLinkDecision =
  | { action: "none"; next: WaLinkAlertState }
  | { action: "alert_down"; reason: string; sinceMs: number; next: WaLinkAlertState }
  | { action: "alert_up"; next: WaLinkAlertState };

/**
 * A manager object that was only constructed, and never started, is not an outage.
 */
export function shouldWatchWaSession(snap: WaStatusSnapshot): boolean {
  if (snap.loggedOut || snap.pairing || snap.hasQr || snap.hasClient) {
    return true;
  }
  if (snap.lastError !== null || snap.bootPhase !== null) {
    return true;
  }
  return snap.state !== "disconnected";
}

/**
 * Logout and a rejected app version will not recover by waiting.
 */
function isTerminalDown(observation: WaLinkObservation): boolean {
  if (observation.loggedOut) {
    return true;
  }
  const errorText = observation.lastError ?? "";
  return errorText.toLowerCase().includes("client outdated");
}

/**
 * Prefer the session's own error text. Otherwise say it is still not connected.
 */
function downReason(observation: WaLinkObservation): string {
  const errorText = observation.lastError?.trim() ?? "";
  if (errorText.length === 0) {
    return "still not connected";
  }
  if (errorText.length <= MAX_REASON_CHARS) {
    return errorText;
  }
  return `${errorText.slice(0, MAX_REASON_CHARS - 1)}…`;
}

/**
 * Decides whether this check should send, wait, or clear.
 * `next.downAlertDelivered` is true only for a down alert that the caller then delivers.
 */
export function decideWaLinkAlert(
  state: WaLinkAlertState,
  observation: WaLinkObservation,
): WaLinkDecision {
  if (observation.sendReady) {
    if (state.downAlertDelivered) {
      return { action: "alert_up", next: INITIAL_WA_LINK_ALERT_STATE };
    }
    return { action: "none", next: INITIAL_WA_LINK_ALERT_STATE };
  }

  // A QR on screen is the operator fixing the link, not an outage.
  if (observation.pairing) {
    return {
      action: "none",
      next: {
        downSinceMs: null,
        downAlertDelivered: state.downAlertDelivered,
      },
    };
  }

  if (state.downAlertDelivered) {
    return { action: "none", next: state };
  }

  const reason = downReason(observation);
  if (isTerminalDown(observation)) {
    return {
      action: "alert_down",
      reason,
      sinceMs: observation.nowMs,
      next: {
        downSinceMs: observation.nowMs,
        downAlertDelivered: true,
      },
    };
  }

  const downSinceMs = state.downSinceMs ?? observation.nowMs;
  const elapsedMs = observation.nowMs - downSinceMs;
  // First sight of a drop only starts the clock. Alert once the grace has fully elapsed.
  if (state.downSinceMs === null || elapsedMs < observation.graceMs) {
    return {
      action: "none",
      next: {
        downSinceMs,
        downAlertDelivered: false,
      },
    };
  }

  return {
    action: "alert_down",
    reason,
    sinceMs: downSinceMs,
    next: {
      downSinceMs,
      downAlertDelivered: true,
    },
  };
}

/**
 * Applies a decision after the send attempt.
 * A failed send keeps the previous state so the next check tries again.
 */
export function commitWaLinkDecision(
  previous: WaLinkAlertState,
  decision: WaLinkDecision,
  sendSucceeded: boolean,
): WaLinkAlertState {
  if (decision.action === "none") {
    return decision.next;
  }
  if (!sendSucceeded) {
    return previous;
  }
  return decision.next;
}

/**
 * Formats an epoch instant as `12 Oct 2026, 11:40 MYT`.
 */
export function formatAlertWhenMyt(epochMs: number): string {
  const formatted = new Date(epochMs).toLocaleString("sv-SE", {
    timeZone: "Asia/Kuala_Lumpur",
  });
  const parts = formatted.split(" ");
  const datePart = parts[0];
  const timePart = parts[1];
  if (datePart === undefined || timePart === undefined) {
    return formatted;
  }
  const dateBits = datePart.split("-");
  const year = dateBits[0];
  const monthText = dateBits[1];
  const dayText = dateBits[2];
  if (year === undefined || monthText === undefined || dayText === undefined) {
    return formatted;
  }
  const monthLabel = MYT_MONTHS[Number(monthText) - 1];
  if (monthLabel === undefined) {
    return formatted;
  }
  const clock = timePart.slice(0, 5);
  return `${String(Number(dayText))} ${monthLabel} ${year}, ${clock} MYT`;
}

/**
 * Down alert body. `sinceMs` is when the outage clock started, or "now" for a logout.
 */
export function formatWaDownAlert(input: {
  projectName: string;
  sinceMs: number;
  reason: string;
}): string {
  const lines = [
    "🔴 WhatsApp is not connected",
    `Project: ${input.projectName}`,
    `Since: ${formatAlertWhenMyt(input.sinceMs)}`,
    `Reason: ${input.reason}`,
  ];
  return lines.join("\n");
}

/**
 * Recovery body. Sent once, and only after the down message was delivered.
 */
export function formatWaUpAlert(projectName: string): string {
  const lines = ["🟢 WhatsApp is connected again", `Project: ${projectName}`];
  return lines.join("\n");
}

/**
 * Checks warm sessions and sends at most one Telegram message per project per outage.
 * Returns a stop function. Missing token, chat id, or the kill-switch makes that a no-op.
 */
export function startWaLinkAlert(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
): () => void {
  if (!env.NMCAS_TELEGRAM_WA_ALERT_ENABLED) {
    console.warn("[wa-link-alert] disabled (NMCAS_TELEGRAM_WA_ALERT_ENABLED=false)");
    return () => {
      /* no-op */
    };
  }
  if (env.TELEGRAM_BOT_TOKEN.length === 0 || env.TELEGRAM_CHAT_ID.length === 0) {
    console.warn("[wa-link-alert] skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is empty");
    return () => {
      /* no-op */
    };
  }

  const states = new Map<string, WaLinkAlertState>();
  let stopped = false;
  let inFlight = false;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let firstTimer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    const projectIds = waPool.listWarmProjectIds();
    if (projectIds.length === 0) {
      return;
    }
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(projects.map((project) => [project.id, project.name]));

    for (const projectId of projectIds) {
      const snap = waPool.peekStatusSnapshot(projectId);
      if (snap === null || !shouldWatchWaSession(snap)) {
        continue;
      }
      const sendReady = await waPool.peekIsSendReady(projectId);
      const previous = states.get(projectId) ?? INITIAL_WA_LINK_ALERT_STATE;
      const decision = decideWaLinkAlert(previous, {
        nowMs: Date.now(),
        sendReady,
        loggedOut: snap.loggedOut,
        pairing: snap.pairing || snap.hasQr,
        lastError: snap.lastError,
        graceMs: env.NMCAS_WA_DOWN_GRACE_MS,
      });

      if (decision.action === "none") {
        states.set(projectId, decision.next);
        continue;
      }

      const storedName = nameById.get(projectId)?.trim() ?? "";
      const projectName = storedName.length > 0 ? storedName : projectId;
      const text =
        decision.action === "alert_down"
          ? formatWaDownAlert({
              projectName,
              sinceMs: decision.sinceMs,
              reason: decision.reason,
            })
          : formatWaUpAlert(projectName);
      const sent = await sendTelegramText(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, text);
      states.set(projectId, commitWaLinkDecision(previous, decision, sent.ok));
      if (sent.ok) {
        console.warn(
          `[wa-link-alert] sent action=${decision.action} projectId=${projectId}`,
        );
      } else {
        console.warn(
          `[wa-link-alert] send failed projectId=${projectId} error=${sent.error}`,
        );
      }
    }

    for (const projectId of states.keys()) {
      if (!projectIds.includes(projectId)) {
        states.delete(projectId);
      }
    }
  };

  const run = (): void => {
    if (stopped || inFlight) {
      return;
    }
    inFlight = true;
    void tick()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[wa-link-alert] tick failed: ${message}`);
      })
      .finally(() => {
        inFlight = false;
      });
  };

  firstTimer = setTimeout(() => {
    run();
    intervalId = setInterval(run, POLL_MS);
    intervalId.unref?.();
  }, FIRST_DELAY_MS);
  firstTimer.unref?.();

  console.warn(
    `[wa-link-alert] watching warm sessions every ${String(POLL_MS / 1000)}s (grace=${String(env.NMCAS_WA_DOWN_GRACE_MS)}ms)`,
  );

  return () => {
    stopped = true;
    if (firstTimer !== undefined) {
      clearTimeout(firstTimer);
    }
    if (intervalId !== undefined) {
      clearInterval(intervalId);
    }
  };
}
