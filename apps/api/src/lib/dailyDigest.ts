/**
 * Daily WhatsApp ops digest: platform status + that day's scheduled messages (MYT).
 *
 * Runs in-process (same API that holds the WA session). Sends a DM to each
 * `NMCAS_FAILURE_NOTIFY_MSISDN` recipient via a send-ready project's linked account.
 */

import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import type { WaConnectionPool } from "../wa/wa-pool.js";
import { toWhatsAppUserJid } from "./notifyMsisdn.js";
import { addMytCalendarDays, mytInstant, todayMytYmd } from "./campaignSchedule.js";
import { memSampleForJson, sampleMemory } from "./mem-sample.js";

/** Align with rescue-sweep: PENDING past this grace is overdue. */
const PENDING_GRACE_MS = 10_000;

/** Align with rescue-sweep: SENDING past this age is stuck. */
const SENDING_STUCK_MS = 10 * 60_000;

/** WhatsApp practical text budget; keep headroom under ~4096. */
const MAX_DIGEST_CHARS = 3500;

/** Cap how many message lines are listed before summarizing the rest. */
const MAX_MESSAGE_LINES = 40;

export type DailyDigestMessageRow = {
  scheduledAt: Date;
  status: string;
  groupName: string;
  projectName: string;
  slotOrKind: string;
};

export type DailyDigestWaRow = {
  projectName: string;
  state: string;
  sendReady: boolean;
};

export type DailyDigestSnapshot = {
  dateYmd: string;
  memoryLine: string;
  overduePending: number;
  stuckSending: number;
  failedLast24h: number;
  waRows: DailyDigestWaRow[];
  messages: DailyDigestMessageRow[];
};

/**
 * UTC half-open range for one MYT calendar day: [start, end).
 */
export function mytDayUtcRange(dateYmd: string): { startUtc: Date; endUtc: Date } {
  const startUtc = mytInstant(dateYmd, "00:00");
  const nextYmd = addMytCalendarDays(dateYmd, 1);
  const endUtc = mytInstant(nextYmd, "00:00");
  return { startUtc, endUtc };
}

/**
 * Formats a clock time in MYT as HH:mm (24h).
 */
export function formatClockMyt(d: Date): string {
  const s = d.toLocaleString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
  const parts = s.split(" ");
  const timePart = parts[1];
  if (timePart === undefined || timePart.length < 5) {
    return "??:??";
  }
  return timePart.slice(0, 5);
}

/**
 * Formats YYYY-MM-DD for the digest header (en-GB medium date in MYT).
 */
export function formatDigestDateLabel(dateYmd: string): string {
  const noon = mytInstant(dateYmd, "12:00");
  return noon.toLocaleDateString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Pads hour 0–23 to HH:00 clock string for {@link mytInstant}.
 */
export function hourToHhmm(hour: number): string {
  const h = Math.min(23, Math.max(0, Math.trunc(hour)));
  return `${String(h).padStart(2, "0")}:00`;
}

/**
 * Milliseconds until the next digest fire at `hourMyt` on a MYT calendar day.
 * If today's slot has already passed, schedules tomorrow.
 */
export function msUntilNextDigest(now: Date, hourMyt: number): number {
  const ymd = now.toLocaleString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" }).split(" ")[0];
  if (ymd === undefined || ymd.length === 0) {
    throw new Error("Failed to compute MYT date for digest schedule");
  }
  let target = mytInstant(ymd, hourToHhmm(hourMyt));
  if (now.getTime() >= target.getTime()) {
    const tomorrow = addMytCalendarDays(ymd, 1);
    target = mytInstant(tomorrow, hourToHhmm(hourMyt));
  }
  return Math.max(1_000, target.getTime() - now.getTime());
}

/**
 * Builds the WhatsApp text body from a pre-loaded snapshot (pure; easy to test).
 */
export function formatDailyDigestText(snapshot: DailyDigestSnapshot): string {
  const lines: string[] = [];
  lines.push(`[NMCAS] Daily digest — ${formatDigestDateLabel(snapshot.dateYmd)} MYT`);
  lines.push("");
  lines.push("*Platform*");
  lines.push(snapshot.memoryLine);
  lines.push(
    `Stuck/overdue: PENDING ${String(snapshot.overduePending)}, SENDING ${String(snapshot.stuckSending)}`,
  );
  lines.push(`Failed (last 24h): ${String(snapshot.failedLast24h)}`);
  lines.push("");
  lines.push("*WhatsApp*");
  if (snapshot.waRows.length === 0) {
    lines.push("(no projects)");
  } else {
    for (const row of snapshot.waRows) {
      const ready = row.sendReady ? "send-ready" : "not send-ready";
      lines.push(`• ${row.projectName}: ${row.state}, ${ready}`);
    }
  }
  lines.push("");
  lines.push(`*Today's messages* (${String(snapshot.messages.length)})`);
  if (snapshot.messages.length === 0) {
    lines.push("(none scheduled)");
  } else {
    const shown = snapshot.messages.slice(0, MAX_MESSAGE_LINES);
    for (const msg of shown) {
      const clock = formatClockMyt(msg.scheduledAt);
      const slot = msg.slotOrKind.length > 0 ? ` | ${msg.slotOrKind}` : "";
      lines.push(
        `• ${clock} ${msg.status} | ${msg.projectName} | ${msg.groupName}${slot}`,
      );
    }
    const omitted = snapshot.messages.length - shown.length;
    if (omitted > 0) {
      lines.push(`… +${String(omitted)} more`);
    }
  }

  let text = lines.join("\n");
  if (text.length > MAX_DIGEST_CHARS) {
    text = `${text.slice(0, MAX_DIGEST_CHARS - 1)}…`;
  }
  return text;
}

type ProjectLite = { id: string; name: string };

/**
 * Loads counts, WA snapshots, and today's messages across all projects.
 */
export async function buildDailyDigestSnapshot(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
  dateYmd: string = todayMytYmd(),
): Promise<DailyDigestSnapshot> {
  const { startUtc, endUtc } = mytDayUtcRange(dateYmd);
  const now = new Date();
  const pendingCutoff = new Date(now.getTime() - PENDING_GRACE_MS);
  const sendingCutoff = new Date(now.getTime() - SENDING_STUCK_MS);
  const failedSince = new Date(now.getTime() - 24 * 60 * 60_000);

  const defaultId = env.DEFAULT_PROJECT_ID.trim();
  const projectsRaw: ProjectLite[] = await prisma.project.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const projects = [
    ...projectsRaw.filter((p) => p.id === defaultId),
    ...projectsRaw.filter((p) => p.id !== defaultId),
  ];

  const [overduePending, stuckSending, failedLast24h, messageRows] = await Promise.all([
    prisma.scheduledMessage.count({
      where: { status: "PENDING", scheduledAt: { lte: pendingCutoff } },
    }),
    prisma.scheduledMessage.count({
      where: { status: "SENDING", scheduledAt: { lte: sendingCutoff } },
    }),
    prisma.scheduledMessage.count({
      where: { status: "FAILED", scheduledAt: { gte: failedSince } },
    }),
    prisma.scheduledMessage.findMany({
      where: {
        scheduledAt: { gte: startUtc, lt: endUtc },
      },
      orderBy: [{ scheduledAt: "asc" }, { projectId: "asc" }],
      select: {
        scheduledAt: true,
        status: true,
        groupName: true,
        operatorKind: true,
        project: { select: { name: true } },
        reminderTemplate: { select: { slotKey: true, name: true } },
      },
    }),
  ]);

  const mem = memSampleForJson(sampleMemory(waPool));
  const memoryLine = `Memory: rss ${String(mem.rssMb)}MB, heap ${String(mem.heapUsedMb)}/${String(mem.heapTotalMb)}MB, WA warm: ${String(mem.waWarmClients)}`;

  const waRows: DailyDigestWaRow[] = [];
  for (const project of projects) {
    const snap = waPool.peekStatusSnapshot(project.id);
    const sendReady = snap === null ? false : await waPool.peekIsSendReady(project.id);
    waRows.push({
      projectName: project.name,
      state: snap === null ? "cold" : snap.state,
      sendReady,
    });
  }

  const messages: DailyDigestMessageRow[] = messageRows.map((row) => {
    let slotOrKind = "";
    if (row.reminderTemplate !== null) {
      slotOrKind = row.reminderTemplate.slotKey;
    } else if (row.operatorKind !== null) {
      slotOrKind = row.operatorKind;
    }
    return {
      scheduledAt: row.scheduledAt,
      status: row.status,
      groupName: row.groupName,
      projectName: row.project.name,
      slotOrKind,
    };
  });

  return {
    dateYmd,
    memoryLine,
    overduePending,
    stuckSending,
    failedLast24h,
    waRows,
    messages,
  };
}

/**
 * Picks a project whose WA client can send the digest DM.
 * Prefers DEFAULT_PROJECT_ID, then any send-ready warm project.
 */
async function resolveSendProjectId(
  env: ApiEnv,
  waPool: WaConnectionPool,
  projectIds: string[],
): Promise<string | null> {
  const preferred = env.DEFAULT_PROJECT_ID.trim();
  const ordered = [
    preferred,
    ...projectIds.filter((id) => id !== preferred),
  ].filter((id) => id.length > 0);

  for (const projectId of ordered) {
    try {
      await waPool.start(projectId);
      if (await waPool.isSendReady(projectId)) {
        return projectId;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Assembles and sends today's digest DM. Swallows send errors (ops-only).
 */
export async function runDailyDigest(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
): Promise<void> {
  try {
    const snapshot = await buildDailyDigestSnapshot(prisma, env, waPool);
    const text = formatDailyDigestText(snapshot);
    const projects = await prisma.project.findMany({ select: { id: true } });
    const projectIds = projects.map((p) => p.id);
    const sendProjectId = await resolveSendProjectId(env, waPool, projectIds);
    if (sendProjectId === null) {
      console.warn("[daily-digest] skipped: no send-ready WhatsApp session");
      return;
    }
    const msisdns = env.NMCAS_FAILURE_NOTIFY_MSISDN;
    if (msisdns.length === 0) {
      console.warn("[daily-digest] skipped: no notify MSISDNs");
      return;
    }
    const wa = waPool.getManager(sendProjectId);
    for (const msisdn of msisdns) {
      await wa.sendDirectText(toWhatsAppUserJid(msisdn), text);
    }
    console.warn(
      `[daily-digest] sent date=${snapshot.dateYmd} projectId=${sendProjectId} messages=${String(snapshot.messages.length)} recipients=${String(msisdns.length)}`,
    );
  } catch (err: unknown) {
    console.error(
      "[daily-digest] failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Schedules the next digest at `NMCAS_DIGEST_HOUR_MYT` MYT, then re-arms after each run.
 * Returns a stop function for graceful shutdown.
 */
export function startDailyDigest(
  prisma: PrismaClient,
  env: ApiEnv,
  waPool: WaConnectionPool,
): () => void {
  if (!env.NMCAS_DIGEST_ENABLED) {
    console.warn("[daily-digest] disabled (NMCAS_DIGEST_ENABLED=false)");
    return () => {
      /* no-op */
    };
  }

  const hourMyt = env.NMCAS_DIGEST_HOUR_MYT;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const arm = (): void => {
    if (stopped) {
      return;
    }
    const delay = msUntilNextDigest(new Date(), hourMyt);
    console.warn(
      `[daily-digest] next run in ${String(Math.round(delay / 60_000))} min (hour=${String(hourMyt)} MYT)`,
    );
    timeoutId = setTimeout(() => {
      void runDailyDigest(prisma, env, waPool).finally(() => {
        arm();
      });
    }, delay);
    timeoutId.unref?.();
  };

  arm();

  return () => {
    stopped = true;
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  };
}
