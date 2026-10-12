/**
 * One whatsmeow-node client per `projectId` (SQLite file hydrated from Postgres blob).
 * A `WaConnectionPool` owns one `WaManager` per project in the API process.
 */

import {
  createClient,
  type GroupInfo,
  type SendResponse,
  type WhatsmeowClient,
} from "@whatsmeow-node/whatsmeow-node";
import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import {
  buildEngagementChatAllowlist,
  hasEncryptedReaction,
  isEngagementChatAllowed,
  parseDecryptedReactionPayload,
  parsePlainReactionMessage,
  parseQuotedReplyEvent,
  waTimestampToDate,
  type ParsedReactionEvent,
  type ParsedReplyEvent,
} from "../lib/waEngagement.js";
import {
  DEFAULT_WA_RECEIPT_TIMEOUT_MS,
  buildNoReceiptErrorMessage,
  isPastReceiptDeadline,
  receiptSentUpdateWhere,
} from "../lib/waReceipt.js";
import { parseActiveCommunityJids } from "../lib/valueFanOut.js";
import { sendGroupImage, sendGroupPoll, sendGroupSticker, sendGroupText, withTempImageFile } from "./wa-send.js";
import {
  planPairingAfterDeadStoredSession,
  planPairingAfterInit,
  planPairingAfterLoggedInWaitFailed,
} from "../lib/waQrPairing.js";
import {
  hydrateWhatsAppSessionFromBlob,
  persistWhatsAppSessionToBlob,
  resolveWhatsAppStoreUri,
  WHATSAPP_COMMAND_TIMEOUT_MS,
  wipeWhatsAppStore,
} from "./whatsapp-store.js";

export type WaConnectionUiState = "disconnected" | "connecting" | "connected";

/** In-memory WhatsApp status. Safe to read on an HTTP request without booting a session. */
export type WaStatusSnapshot = {
  state: WaConnectionUiState;
  hasQr: boolean;
  pairing: boolean;
  hasClient: boolean;
  startWorkInFlight: boolean;
  lastError: string | null;
  bootPhase: string | null;
  /** True after WhatsApp logged this session out. It will not reconnect until a new QR scan. */
  loggedOut: boolean;
};

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 60_000;

/**
 * Default interval for background joined-groups refresh while the session is connected.
 * Keeps the in-memory group cache warm for Schedule destinations without a UI click.
 */
export const DEFAULT_WA_GROUPS_REFRESH_INTERVAL_MS = 3 * 60_000;

/**
 * Computes supervised reconnect delay with exponential backoff.
 *
 * @example attempt=1 -> 1000ms
 * @example attempt=2 -> 2000ms
 * @example attempt>=6 -> capped at 60000ms
 */
export function computeReconnectDelayMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 1;
  const exp = Math.pow(2, safeAttempt - 1);
  const delayMs = RECONNECT_BASE_DELAY_MS * exp;
  return Math.min(RECONNECT_MAX_DELAY_MS, delayMs);
}

/**
 * Builds a cheap status snapshot for `/wa/status` without forcing a cold boot.
 * `hasQr` overrides UI state so the UI shows a scanner-like "connecting" mode.
 */
export function buildWaConnectionStatusSnapshot(
  uiState: WaConnectionUiState,
  hasQr: boolean,
): { state: WaConnectionUiState; hasQr: boolean } {
  const state = hasQr ? "connecting" : uiState;
  return { state, hasQr };
}

export type WaGroupOption = {
  jid: string;
  /** Raw WhatsApp group title. */
  name: string;
  /**
   * Human-readable row for the picker, e.g. `RDW 4.0 › Announcements`.
   */
  label: string;
  /** Community display name when this chat is a community subgroup. */
  communityName?: string;
  /** Channel / subgroup name within the community (e.g. `Announcements`). */
  channelName?: string;
  /** True when WhatsApp marks the group as announcement-only. */
  isAnnounce?: boolean;
  /** Parent community shell JID when known (stable picker key). */
  communityJid?: string;
};

type CommunityChildMeta = {
  communityJid: string;
  communityName: string;
  channelName: string;
  isDefaultSub: boolean;
};

/**
 * Builds picker fields from joined-group metadata and optional community child map.
 */
function buildWaGroupOption(
  g: GroupInfo,
  childMeta: CommunityChildMeta | undefined,
): WaGroupOption {
  const nameRaw = typeof g.name === "string" ? g.name.trim() : "";
  const name = nameRaw.length > 0 ? nameRaw : "";
  const isAnnounce = g.announce === true;

  if (childMeta !== undefined) {
    const channelName =
      childMeta.channelName.length > 0
        ? childMeta.channelName
        : isAnnounce || childMeta.isDefaultSub
          ? "Announcements"
          : name.length > 0
            ? name
            : "Group";
    const communityName =
      childMeta.communityName.length > 0
        ? childMeta.communityName
        : name.length > 0
          ? name
          : "Community";
    return {
      jid: g.jid,
      name,
      communityJid: childMeta.communityJid,
      communityName,
      channelName,
      isAnnounce: isAnnounce || childMeta.isDefaultSub,
      label: `${communityName} › ${channelName}`,
    };
  }

  if (isAnnounce) {
    const channelName = "Announcements";
    const communityName =
      name.length > 0 && name.toLowerCase() !== "announcements" ? name : "Community";
    const label =
      name.length > 0 && name.toLowerCase() !== "announcements"
        ? `${name} › ${channelName}`
        : channelName;
    return {
      jid: g.jid,
      name,
      communityName,
      channelName,
      isAnnounce: true,
      label,
    };
  }

  const label = name.length > 0 ? name : "(unnamed group)";
  return { jid: g.jid, name, label, isAnnounce: false };
}

export class WaManager {
  private readonly env: ApiEnv;

  private readonly prisma: PrismaClient;

  /** Prisma project id; session store is isolated per project. */
  private readonly projectId: string;

  private client: WhatsmeowClient | undefined;

  private latestQr: string | undefined;

  private uiState: WaConnectionUiState = "disconnected";

  /** Serialized boot / reset / shutdown operations. */
  private waOpChain: Promise<void> = Promise.resolve();

  /** Cached group picker options. */
  private groupCache: { fetchedAt: number; options: WaGroupOption[] } | undefined;

  /** De-duplicates concurrent group fetches. */
  private groupFetchInFlight: Promise<WaGroupOption[]> | undefined;

  /** Periodic blob upload while linked (session keys rotate). */
  private persistTimer: ReturnType<typeof setInterval> | undefined;

  /** Periodic joined-groups refresh while connected (keeps Schedule picker warm). */
  private groupsRefreshTimer: ReturnType<typeof setInterval> | undefined;

  /**
   * Short-lived allowlist of chat JIDs eligible for engagement ingest
   * (tracked NMCAS groupJids + activeCommunityJids).
   */
  private engagementAllowlistCache:
    | { fetchedAt: number; allowlist: Set<string> }
    | undefined;

  /** Local SQLite fingerprint after last successful blob upload (skip unchanged persists). */
  private lastPersistMeta: { size: number; mtimeMs: number } | undefined;

  /** Last API/worker touch — used by `WaConnectionPool` idle eviction. */
  private lastActivityAtMs: number = Date.now();

  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  /** Exponential reconnect backoff (server-owned supervised reconnect). */
  private reconnectBackoffMs: number = 1_000;

  /**
   * Consecutive `isLoggedIn` + `waitForConnection` failures.
   * After the threshold we wipe and open a fresh QR so the UI is not stuck forever.
   */
  private loggedInWaitFailures: number = 0;

  /**
   * True from the moment we open a QR pairing channel until connected / abandoned.
   * Broader than `latestQr` — protects the pre-QR window from pool eviction.
   */
  private qrPairingActive: boolean = false;

  /** Last operator-visible WA error (exit, QR timeout, boot failure). */
  private lastError: string | undefined;

  /**
   * Short label for where `boot()` / `ensureRunning()` is currently blocked.
   * Surfaced in `/wa/status` so operators can see hangs without server SSH.
   */
  private bootPhase: string | undefined;

  private isShuttingDown: boolean = false;

  /**
   * True while `ensureRunning`/`boot` from `start()` is on the op chain.
   * Lets HTTP status avoid stacking duplicate boots on every poll.
   */
  private startWorkInFlight: boolean = false;

  /**
   * Optional hook injected by `WaConnectionPool`.
   * Called just before QR pairing opens so the pool can evict other warm clients,
   * freeing RAM on memory-constrained hosts (e.g. 512 MB DigitalOcean droplet).
   */
  private readonly onBeforeQrPairing: (() => Promise<void>) | undefined;

  /**
   * True only after `logged_out` so we cancel reconnect timers for operator relinking.
   * Cleared on `start()` so a fresh boot can re-enter connecting flow.
   */
  private isLoggedOut: boolean = false;

  /** Debounced auto-repair after QR channel timeout / error (no manual reset required). */
  private qrRepairTimer: ReturnType<typeof setTimeout> | undefined;

  /** Caps auto QR repair so we do not loop forever when WhatsApp never emits a QR. */
  private qrRepairAttempts: number = 0;

  private static readonly GROUP_CACHE_TTL_MS = 5 * 60_000;
  private static readonly MAX_QR_REPAIR_ATTEMPTS = 3;

  /** Was 60s; 8MB session re-read every minute caused avoidable heap spikes on 512MB. */
  private static readonly PERSIST_INTERVAL_MS = 5 * 60_000;

  private static readonly GROUPS_REFRESH_INTERVAL_MS = DEFAULT_WA_GROUPS_REFRESH_INTERVAL_MS;

  /** Refresh engagement chat allowlist at most once per minute. */
  private static readonly ENGAGEMENT_ALLOWLIST_TTL_MS = 60_000;

  private static readonly RECONNECT_BASE_MS = 1_000;
  private static readonly RECONNECT_CAP_MS = 60_000;

  constructor(
    env: ApiEnv,
    prisma: PrismaClient,
    projectId: string,
    onBeforeQrPairing?: () => Promise<void>,
  ) {
    const trimmed = projectId.trim();
    if (trimmed.length === 0) {
      throw new Error("WaManager requires a non-empty projectId");
    }
    this.env = env;
    this.prisma = prisma;
    this.projectId = trimmed;
    this.onBeforeQrPairing = onBeforeQrPairing;
  }

  getUiState(): WaConnectionUiState {
    return this.uiState;
  }

  getLatestQr(): string | undefined {
    return this.latestQr;
  }

  /**
   * Cheap in-memory snapshot for HTTP status endpoints.
   * Avoids awaiting cold boot/persist on request paths.
   */
  getStatusSnapshot(): WaStatusSnapshot {
    const hasQr = this.latestQr !== undefined;
    return {
      state: hasQr ? "connecting" : this.uiState,
      hasQr,
      pairing: this.qrPairingActive,
      hasClient: this.client !== undefined,
      startWorkInFlight: this.startWorkInFlight,
      lastError: this.lastError ?? null,
      bootPhase: this.bootPhase ?? null,
      loggedOut: this.isLoggedOut,
    };
  }

  /** Epoch ms of the last start/send/status touch (for idle eviction). */
  getLastActivityAtMs(): number {
    return this.lastActivityAtMs;
  }

  /** Marks the manager as recently used so the pool does not idle-evict it. */
  touchActivity(): void {
    this.lastActivityAtMs = Date.now();
  }

  /**
   * True while QR pairing is active (including the pre-first-QR window) — pool must not evict.
   */
  isQrLinkInProgress(): boolean {
    return this.qrPairingActive || this.getLatestQr() !== undefined;
  }

  /**
   * True while `start()` → ensureRunning/boot is actively running on the op chain.
   */
  isStartWorkInFlight(): boolean {
    return this.startWorkInFlight;
  }

  /**
   * True when `/wa/status` or `/wa/qr` should re-kick `start()` to (re)open QR pairing.
   * Avoids kicking while actively awaiting the first QR payload on an open channel.
   */
  shouldKickStartForQr(): boolean {
    if (this.startWorkInFlight || this.latestQr !== undefined) {
      return false;
    }
    if (this.qrRepairAttempts >= WaManager.MAX_QR_REPAIR_ATTEMPTS) {
      return false;
    }
    if (
      this.qrPairingActive &&
      (this.bootPhase === "awaiting_scan" ||
        this.bootPhase === "qr_connect" ||
        this.bootPhase === "qr_channel")
    ) {
      return false;
    }
    if (this.uiState === "connected" && !this.qrPairingActive) {
      return false;
    }
    return true;
  }

  /** Marks this manager as mid QR-link so the pool will not shut it down for RAM. */
  markQrPairingActive(): void {
    this.qrPairingActive = true;
    this.lastError = undefined;
  }

  /** Clears the QR-pairing guard (connected, abandoned, or logged out). */
  clearQrPairingActive(): void {
    this.qrPairingActive = false;
  }

  /**
   * Ensures the client is booting or connected.
   */
  start(): Promise<void> {
    if (this.isShuttingDown) {
      return Promise.resolve();
    }
    // A fresh start supersedes any pending reconnect timer.
    this.isLoggedOut = false;
    this.cancelQrRepairTimer();
    this.cancelReconnectTimer();
    this.touchActivity();
    // Ensure HTTP status snapshots immediately show "connecting" after a cold start kick.
    if (this.uiState === "disconnected") {
      this.uiState = "connecting";
    }
    this.waOpChain = this.waOpChain
      .then(async () => {
        this.startWorkInFlight = true;
        try {
          await this.ensureRunning();
        } finally {
          this.startWorkInFlight = false;
        }
      })
      .catch((err: unknown) => {
        this.startWorkInFlight = false;
        this.qrPairingActive = false;
        this.bootPhase = undefined;
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = message;
        console.error("[WaManager] boot chain failed:", err);
        this.uiState = "disconnected";
      });
    return this.waOpChain;
  }

  /**
   * Returns whether the client is connected and ready to send.
   */
  async isSendReady(): Promise<boolean> {
    const client = this.client;
    if (client === undefined) {
      return false;
    }
    try {
      const connected = await client.isConnected();
      if (!connected) {
        return false;
      }
      return await client.isLoggedIn();
    } catch {
      return false;
    }
  }

  /**
   * Groups the linked account participates in (for schedule UI picker).
   */
  async fetchGroupOptions(forceRefresh = false): Promise<WaGroupOption[]> {
    this.touchActivity();
    const cached = this.groupCache;
    if (
      !forceRefresh &&
      cached !== undefined &&
      Date.now() - cached.fetchedAt < WaManager.GROUP_CACHE_TTL_MS
    ) {
      return cached.options;
    }
    if (this.groupFetchInFlight !== undefined) {
      return this.groupFetchInFlight;
    }
    const fetchPromise = this.fetchGroupOptionsUncached();
    this.groupFetchInFlight = fetchPromise;
    try {
      const options = await fetchPromise;
      return options;
    } finally {
      this.groupFetchInFlight = undefined;
    }
  }

  private async fetchGroupOptionsUncached(): Promise<WaGroupOption[]> {
    await this.start();
    const client = this.client;
    if (client === undefined) {
      return [];
    }
    if (!(await this.isSendReady())) {
      return [];
    }
    try {
      const startedAt = Date.now();
      /** Cap the Go IPC call to 25 s so the HTTP request is never open for 2 minutes. */
      const getGroupsWithTimeout = (): Promise<Awaited<ReturnType<typeof client.getJoinedGroups>>> => {
        const timeoutMs = 25_000;
        return Promise.race([
          client.getJoinedGroups(),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`getJoinedGroups timed out after ${String(timeoutMs)}ms — WhatsApp sync may still be in progress`));
            }, timeoutMs);
          }),
        ]);
      };
      const groups = await getGroupsWithTimeout();
      console.info(
        `[WaManager] getJoinedGroups projectId=${this.projectId} count=${String(groups.length)} elapsedMs=${String(Date.now() - startedAt)}`,
      );

      const joined = groups.filter((g) => g.jid.endsWith("@g.us"));
      const { parentJids, parentByNormName, childMetaByJid } =
        await this.resolveCommunityLinks(client, joined);

      const out: WaGroupOption[] = [];
      for (const g of joined) {
        if (parentJids.has(g.jid)) {
          // Community shells are not postable targets in WhatsApp.
          continue;
        }
        let option = buildWaGroupOption(g, childMetaByJid.get(g.jid));
        option = this.attachOrphanCommunityJid(option, g, parentByNormName);
        out.push(option);
      }

      out.sort((a, b) => {
        const byLabel = a.label.localeCompare(b.label);
        return byLabel !== 0 ? byLabel : a.jid.localeCompare(b.jid);
      });
      this.groupCache = { fetchedAt: Date.now(), options: out };
      console.info(
        `[WaManager] group picker projectId=${this.projectId} options=${String(out.length)} communities=${String(parentJids.size)} elapsedMs=${String(Date.now() - startedAt)}`,
      );
      return out;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WaManager] fetchGroupOptionsUncached failed projectId=${this.projectId}: ${message}`);
      // Re-throw so the HTTP route can respond with 503 instead of silently returning an empty list.
      throw err;
    }
  }

  /**
   * Maps community parents → children via `getSubGroups`, only for likely parents
   * (non-announce groups whose subject is shared with another joined group). Full N+1 on
   * every group is too slow and blocks the serial Go IPC used for sends.
   */
  private async resolveCommunityLinks(
    client: WhatsmeowClient,
    joined: GroupInfo[],
  ): Promise<{
    parentJids: Set<string>;
    /** Normalized community title → parent shell JIDs (multiple when titles collide). */
    parentByNormName: Map<string, string[]>;
    childMetaByJid: Map<string, CommunityChildMeta>;
  }> {
    const parentJids = new Set<string>();
    const parentByNormName = new Map<string, string[]>();
    const childMetaByJid = new Map<string, CommunityChildMeta>();

    const registerParentName = (parent: GroupInfo): void => {
      const norm =
        typeof parent.name === "string" && parent.name.trim().length > 0
          ? parent.name.trim().toLowerCase()
          : "";
      if (norm.length === 0) {
        return;
      }
      const list = parentByNormName.get(norm);
      if (list === undefined) {
        parentByNormName.set(norm, [parent.jid]);
      } else if (!list.includes(parent.jid)) {
        list.push(parent.jid);
      }
    };

    const byName = new Map<string, GroupInfo[]>();
    for (const g of joined) {
      const key = typeof g.name === "string" ? g.name.trim().toLowerCase() : "";
      const list = byName.get(key);
      if (list === undefined) {
        byName.set(key, [g]);
      } else {
        list.push(g);
      }
    }

    const parentCandidates: GroupInfo[] = [];
    for (const g of joined) {
      if (g.announce) {
        continue;
      }
      const key = typeof g.name === "string" ? g.name.trim().toLowerCase() : "";
      const siblings = byName.get(key) ?? [g];
      const nameShared = siblings.length > 1;
      const sharesNameWithAnnounce = siblings.some((s) => s.announce && s.jid !== g.jid);
      if (nameShared || sharesNameWithAnnounce) {
        parentCandidates.push(g);
      }
    }

    for (const parent of parentCandidates) {
      try {
        const subs = await client.getSubGroups(parent.jid);
        if (subs.length === 0) {
          continue;
        }
        parentJids.add(parent.jid);
        registerParentName(parent);
        const communityName =
          typeof parent.name === "string" && parent.name.trim().length > 0
            ? parent.name.trim()
            : "Community";
        for (const sub of subs) {
          if (!sub.jid.endsWith("@g.us") || sub.jid === parent.jid) {
            continue;
          }
          const channelRaw = typeof sub.name === "string" ? sub.name.trim() : "";
          const channelName =
            channelRaw.length > 0
              ? channelRaw
              : sub.isDefaultSub
                ? "Announcements"
                : "Group";
          childMetaByJid.set(sub.jid, {
            communityJid: parent.jid,
            communityName,
            channelName,
            isDefaultSub: sub.isDefaultSub === true,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[WaManager] getSubGroups failed projectId=${this.projectId} jid=${parent.jid}: ${message}`,
        );
      }
    }

    return { parentJids, parentByNormName, childMetaByJid };
  }

  /**
   * Links orphan announcement channels to a parent shell when the title matches uniquely.
   */
  private attachOrphanCommunityJid(
    option: WaGroupOption,
    g: GroupInfo,
    parentByNormName: Map<string, string[]>,
  ): WaGroupOption {
    if (option.communityJid !== undefined) {
      return option;
    }
    const norm =
      typeof g.name === "string" && g.name.trim().length > 0 ? g.name.trim().toLowerCase() : "";
    if (norm.length === 0) {
      return option;
    }
    const parents = parentByNormName.get(norm);
    if (parents === undefined || parents.length !== 1) {
      return option;
    }
    const communityJid = parents[0];
    if (communityJid === undefined) {
      return option;
    }
    const communityName =
      option.communityName ??
      (typeof g.name === "string" && g.name.trim().length > 0 ? g.name.trim() : "Community");
    const channelName =
      option.channelName ?? (g.announce === true ? "Announcements" : communityName);
    return {
      ...option,
      communityJid,
      communityName,
      channelName,
      label: `${communityName} › ${channelName}`,
    };
  }

  /**
   * Sends a post (text and/or image) to a group.
   * @returns WhatsApp `SendResponse` so the worker can store `waMessageId` before receipt.
   */
  async sendPost(
    groupJid: string,
    text: string,
    imageBuffer: Buffer | undefined,
    mimetype: string,
  ): Promise<SendResponse> {
    this.touchActivity();
    const client = this.client;
    if (client === undefined) {
      throw new Error("WhatsApp client is not initialized");
    }
    if (imageBuffer !== undefined) {
      return withTempImageFile(imageBuffer, mimetype, async (filePath) => {
        return sendGroupImage(client, groupJid, filePath, text, mimetype);
      });
    }
    return sendGroupText(client, groupJid, text);
  }

  /**
   * Sends a native poll to a group.
   * @returns WhatsApp `SendResponse` so the worker can store `waMessageId` before receipt.
   */
  async sendPoll(
    groupJid: string,
    question: string,
    options: string[],
    selectableCount: number,
  ): Promise<SendResponse> {
    this.touchActivity();
    const client = this.client;
    if (client === undefined) {
      throw new Error("WhatsApp client is not initialized");
    }
    return sendGroupPoll(client, groupJid, question, options, selectableCount);
  }

  /**
   * Sends a static WebP sticker to a group.
   * @returns WhatsApp `SendResponse` so the worker can store `waMessageId` before receipt.
   */
  async sendSticker(groupJid: string, stickerBuffer: Buffer): Promise<SendResponse> {
    this.touchActivity();
    const client = this.client;
    if (client === undefined) {
      throw new Error("WhatsApp client is not initialized");
    }
    return withTempImageFile(stickerBuffer, "image/webp", async (filePath) => {
      return sendGroupSticker(client, groupJid, filePath);
    });
  }

  /**
   * Sends a plain DM/alert text (failure notify). Response id is unused by callers.
   */
  async sendDirectText(msisdnJid: string, text: string): Promise<SendResponse> {
    this.touchActivity();
    const client = this.client;
    if (client === undefined) {
      throw new Error("WhatsApp client is not initialized");
    }
    return sendGroupText(client, msisdnJid, text);
  }

  /**
   * Closes the client on process shutdown (best-effort).
   * Disconnect is capped so pool eviction cannot hang forever behind a stuck Go IPC call.
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.cancelReconnectTimer();
    this.cancelQrRepairTimer();
    this.stopGroupsRefreshLoop();
    this.bootPhase = "shutdown";
    this.waOpChain = this.waOpChain
      .then(async () => {
        this.stopPersistTimer();
        const client = this.client;
        this.client = undefined;
        this.uiState = "disconnected";
        this.latestQr = undefined;
        this.groupCache = undefined;
        this.qrPairingActive = false;
        if (client !== undefined) {
          try {
            await withTimeout(client.disconnect(), 5_000, "disconnect during shutdown");
          } catch {
            /* ignore — force-close below */
          }
          try {
            client.close();
          } catch {
            /* ignore */
          }
          await sleep(300);
        }
        try {
          await withTimeout(this.safePersist(), 8_000, "persist during shutdown");
        } catch {
          /* ignore — eviction must complete */
        }
        this.bootPhase = undefined;
      })
      .catch((err: unknown) => {
        this.bootPhase = undefined;
        console.error("[WaManager] shutdown failed:", err);
      });
    await this.waOpChain;
  }

  /**
   * Wipes session store and boots a fresh client (new QR).
   * Force-closes any live client immediately so a stuck `init`/`connect` on the
   * op chain rejects and the reset can proceed instead of waiting up to 120s.
   */
  resetSessionForLinking(): Promise<void> {
    this.forceCloseClientForReset();
    this.waOpChain = this.waOpChain
      .then(() => this.performResetSessionForLinking())
      .catch((err: unknown) => {
        console.error("[WaManager] reset chain failed:", err);
        throw err;
      });
    return this.waOpChain;
  }

  /**
   * Immediately drops the Go client so in-flight IPC (`init`, `connect`, …) fails fast.
   */
  private forceCloseClientForReset(): void {
    const existing = this.client;
    this.client = undefined;
    this.latestQr = undefined;
    this.bootPhase = "reset_forced_close";
    this.lastError = undefined;
    if (existing === undefined) {
      return;
    }
    try {
      existing.close();
    } catch {
      /* ignore */
    }
  }

  private async performResetSessionForLinking(): Promise<void> {
    this.stopPersistTimer();
    this.stopGroupsRefreshLoop();
    this.cancelQrRepairTimer();
    this.lastPersistMeta = undefined;
    this.qrRepairAttempts = 0;
    const existing = this.client;
    this.client = undefined;
    this.latestQr = undefined;
    this.uiState = "disconnected";
    this.groupCache = undefined;
    if (existing !== undefined) {
      try {
        await existing.disconnect();
      } catch {
        /* ignore */
      }
      try {
        await existing.logout();
      } catch {
        /* may already be logged out */
      }
      existing.close();
      await sleep(500);
    }
    await wipeWhatsAppStore(this.prisma, this.env, this.projectId);
    /** After an operator reset, always open QR under free RAM (skip stored-session reconnect). */
    await this.openFreshQrPairing();
  }

  private async ensureRunning(): Promise<void> {
    const existing = this.client;
    if (existing !== undefined) {
      try {
        if (await existing.isConnected()) {
          const loggedIn = await this.safeIsLoggedIn(existing);
          if (loggedIn) {
            this.uiState = "connected";
            this.qrPairingActive = false;
            this.latestQr = undefined;
            this.loggedInWaitFailures = 0;
            this.bootPhase = undefined;
            this.cancelQrRepairTimer();
            this.ensureGroupsRefreshLoop();
            return;
          }
          if (
            this.bootPhase === "awaiting_scan" ||
            this.bootPhase === "qr_connect" ||
            this.bootPhase === "qr_channel"
          ) {
            this.uiState = "connecting";
            return;
          }
          console.warn(
            `[WaManager] socket connected but not logged in projectId=${this.projectId}; repairing`,
          );
          await this.disposeClientQuietly(existing);
          this.client = undefined;
          this.latestQr = undefined;
          this.qrPairingActive = false;
          await wipeWhatsAppStore(this.prisma, this.env, this.projectId);
          await this.boot();
          return;
        }
        if (await existing.isLoggedIn()) {
          this.uiState = "connecting";
          this.bootPhase = "reconnect_existing";
          await existing.connect();
          const ok = await existing.waitForConnection(20_000);
          if (ok) {
            this.uiState = "connected";
            this.loggedInWaitFailures = 0;
            this.bootPhase = undefined;
            this.startPersistTimer();
            this.ensureGroupsRefreshLoop();
            await this.safePersist();
            return;
          }
          this.loggedInWaitFailures += 1;
          const plan = planPairingAfterLoggedInWaitFailed(this.loggedInWaitFailures);
          console.warn(
            `[WaManager] logged-in wait failed projectId=${this.projectId} failures=${String(this.loggedInWaitFailures)} plan=${plan}`,
          );
          if (plan === "schedule_reconnect") {
            this.uiState = "connecting";
            this.scheduleReconnect("wait_for_connection_failed");
            return;
          }
          // Fall through: dispose + wipe + fresh QR pairing via boot().
          await this.disposeClientQuietly(existing);
          this.client = undefined;
          this.latestQr = undefined;
          this.loggedInWaitFailures = 0;
          await wipeWhatsAppStore(this.prisma, this.env, this.projectId);
          await this.boot();
          return;
        }
      } catch {
        /* tear down and full boot */
      }
      await this.disposeClientQuietly(existing);
      this.client = undefined;
    }
    await this.boot();
  }

  /**
   * Best-effort disconnect + close so a wiped store is never paired with a live Go process.
   */
  private async disposeClientQuietly(client: WhatsmeowClient): Promise<void> {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
    try {
      await client.logout();
    } catch {
      /* may already be logged out / never paired */
    }
    try {
      client.close();
    } catch {
      /* ignore */
    }
    await sleep(300);
  }

  private attachClientEvents(client: WhatsmeowClient): void {
    client.on("log", (entry) => {
      const level = typeof entry.level === "string" ? entry.level : "info";
      const msg = typeof entry.msg === "string" ? entry.msg : JSON.stringify(entry);
      console.info(`[whatsmeow projectId=${this.projectId}] [${level}] ${msg}`);
    });

    client.on("qr", (payload) => {
      const code =
        typeof payload === "object" &&
        payload !== null &&
        "code" in payload &&
        typeof (payload as { code: unknown }).code === "string"
          ? (payload as { code: string }).code
          : "";
      console.info(
        `[WaManager] qr event projectId=${this.projectId} codeLen=${String(code.length)}`,
      );
      if (code.length === 0) {
        this.lastError = "Received empty QR payload from WhatsApp";
        return;
      }
      this.latestQr = code;
      this.uiState = "connecting";
      this.qrPairingActive = true;
      this.qrRepairAttempts = 0;
      this.lastError = undefined;
      this.bootPhase = "awaiting_scan";
      this.cancelQrRepairTimer();
      this.cancelReconnectTimer();
    });

    client.on("qr:timeout", () => {
      this.latestQr = undefined;
      this.qrPairingActive = false;
      this.bootPhase = undefined;
      this.lastError = "QR timed out — retrying automatically…";
      this.uiState = "disconnected";
      console.warn(`[WaManager] QR channel timed out projectId=${this.projectId}`);
      this.cancelReconnectTimer();
      /** Kill the Go process immediately so the next attempt is not RAM-starved. */
      const dying = this.client;
      this.client = undefined;
      if (dying !== undefined) {
        try {
          dying.close();
        } catch {
          /* ignore */
        }
      }
      this.scheduleQrRepair("qr_timeout");
    });

    client.on("qr:error", (payload) => {
      this.latestQr = undefined;
      this.qrPairingActive = false;
      this.bootPhase = undefined;
      this.lastError = `QR error: ${payload.event} — retrying automatically…`;
      console.error(`[WaManager] QR error projectId=${this.projectId} event=${payload.event}`);
      this.uiState = "disconnected";
      this.cancelReconnectTimer();
      const dying = this.client;
      this.client = undefined;
      if (dying !== undefined) {
        try {
          dying.close();
        } catch {
          /* ignore */
        }
      }
      if (payload.event === "err-client-outdated") {
        this.qrRepairAttempts = WaManager.MAX_QR_REPAIR_ATTEMPTS;
        this.lastError =
          "WhatsApp rejected this app version (client outdated). Update @whatsmeow-node/whatsmeow-node on the server, then Clear session.";
        this.bootPhase = undefined;
        this.qrPairingActive = false;
        return;
      }
      this.scheduleQrRepair(`qr_error_${payload.event}`);
    });

    client.on("connected", () => {
      this.uiState = "connected";
      this.latestQr = undefined;
      this.qrPairingActive = false;
      this.loggedInWaitFailures = 0;
      this.qrRepairAttempts = 0;
      this.lastError = undefined;
      this.bootPhase = undefined;
      this.cancelQrRepairTimer();
      this.startPersistTimer();
      this.ensureGroupsRefreshLoop();
      // Connection succeeded; reset reconnect backoff.
      this.reconnectBackoffMs = WaManager.RECONNECT_BASE_MS;
      this.cancelReconnectTimer();
      void this.safePersistAfterDelay(1500);
      // After restart, fail rows stuck in SENDING with an accepted id past the receipt deadline.
      void this.failStaleAcceptedSends().catch((err: unknown) => {
        console.error(
          `[WaManager] failStaleAcceptedSends failed projectId=${this.projectId}:`,
          err,
        );
      });
    });

    client.on("disconnected", () => {
      this.uiState = "connecting";
      this.stopGroupsRefreshLoop();
      this.scheduleReconnect("disconnected");
    });

    client.on("logged_out", () => {
      this.isLoggedOut = true;
      this.uiState = "disconnected";
      this.latestQr = undefined;
      this.qrPairingActive = false;
      this.lastError = "WhatsApp logged out — scan a new QR";
      this.cancelReconnectTimer();
      this.stopPersistTimer();
      this.stopGroupsRefreshLoop();
      void wipeWhatsAppStore(this.prisma, this.env, this.projectId).catch((err: unknown) => {
        console.error(`[WaManager] wipe after logout failed projectId=${this.projectId}:`, err);
      });
    });

    client.on("error", (err: Error) => {
      this.lastError = err.message;
      console.error(`[WaManager] client error projectId=${this.projectId}:`, err.message);
    });

    client.on("exit", ({ code }) => {
      if (code !== null && code !== 0) {
        console.error(`[WaManager] Go subprocess exited projectId=${this.projectId} code=${String(code)}`);
        this.uiState = "disconnected";
        this.qrPairingActive = false;
        this.latestQr = undefined;
        this.client = undefined;
        this.lastError = `WhatsApp engine exited (code ${String(code)})`;
        this.stopGroupsRefreshLoop();
        this.scheduleReconnect(`exit_code_${String(code)}`);
      }
    });

    client.on("temporary_ban", (payload) => {
      this.lastError = `temporary_ban code=${payload.code} expire=${payload.expire}`;
      console.error(
        `[WaManager] temporary_ban projectId=${this.projectId} code=${payload.code} expire=${payload.expire}`,
      );
    });

    /**
     * Server/delivery receipts for outbound stanza ids.
     * Product SENT = receipt matched stored `waMessageId` while still SENDING.
     */
    client.on("message:receipt", (receipt) => {
      void this.handleMessageReceipt(receipt).catch((err: unknown) => {
        console.error(
          `[WaManager] message:receipt handler failed projectId=${this.projectId}:`,
          err,
        );
      });
    });

    /**
     * Engagement tracker (Agent 4): reactions + quoted replies for tracked NMCAS posts.
     * Allowlisted chats only; matched via `waMessageId` / quoted stanza id.
     */
    client.on("message", (event) => {
      void this.handleInboundEngagement(event).catch((err: unknown) => {
        console.error(
          `[WaManager] engagement ingest failed projectId=${this.projectId}:`,
          err,
        );
      });
    });
  }

  /**
   * Marks matching `ScheduledMessage` rows SENT when a receipt includes their `waMessageId`.
   * Idempotent: ignores unknown ids and rows already past SENDING.
   */
  private async handleMessageReceipt(receipt: {
    type: string;
    chat: string;
    sender: string;
    isGroup: boolean;
    ids: string[];
    timestamp: number;
  }): Promise<void> {
    const where = receiptSentUpdateWhere(receipt.ids);
    if (where === null) {
      return;
    }
    const now = new Date();
    const result = await this.prisma.scheduledMessage.updateMany({
      where: {
        ...where,
        projectId: this.projectId,
      },
      data: {
        status: "SENT",
        sentAt: now,
        waAckedAt: now,
        error: null,
      },
    });
    if (result.count > 0) {
      console.info(
        `[WaManager] receipt → SENT projectId=${this.projectId} count=${String(result.count)} type=${receipt.type} ids=${where.waMessageId.in.join(",")}`,
      );
    }
  }

  /**
   * Loads (and briefly caches) chat JIDs allowed for engagement ingest.
   */
  private async loadEngagementAllowlist(): Promise<Set<string>> {
    const now = Date.now();
    const cached = this.engagementAllowlistCache;
    if (
      cached !== undefined &&
      now - cached.fetchedAt < WaManager.ENGAGEMENT_ALLOWLIST_TTL_MS
    ) {
      return cached.allowlist;
    }

    const [tracked, project] = await Promise.all([
      this.prisma.scheduledMessage.findMany({
        where: {
          projectId: this.projectId,
          waMessageId: { not: null },
        },
        select: { groupJid: true },
        distinct: ["groupJid"],
        take: 500,
      }),
      this.prisma.project.findUnique({
        where: { id: this.projectId },
        select: { activeCommunityJids: true },
      }),
    ]);

    const active =
      project !== null ? parseActiveCommunityJids(project.activeCommunityJids) : null;
    const allowlist = buildEngagementChatAllowlist(
      tracked.map((row) => row.groupJid),
      active,
    );
    this.engagementAllowlistCache = { fetchedAt: now, allowlist };
    return allowlist;
  }

  /**
   * Ingests reactions / quoted replies for allowlisted community chats only.
   * Matches on `ScheduledMessage.waMessageId` (announcement quotes only for replies).
   */
  private async handleInboundEngagement(event: {
    info: {
      id: string;
      chat: string;
      sender: string;
      isFromMe: boolean;
      isGroup: boolean;
      timestamp: number;
      pushName: string;
    };
    message: Record<string, unknown>;
  }): Promise<void> {
    if (!event.info.isGroup) {
      return;
    }
    const allowlist = await this.loadEngagementAllowlist();
    if (!isEngagementChatAllowed(event.info.chat, allowlist)) {
      return;
    }

    const reactionWaId = event.info.id.trim().length > 0 ? event.info.id.trim() : null;
    let reaction = parsePlainReactionMessage(event.message, reactionWaId);

    if (reaction === null && hasEncryptedReaction(event.message)) {
      const client = this.client;
      if (client !== undefined) {
        try {
          const infoRecord: Record<string, unknown> = {
            id: event.info.id,
            chat: event.info.chat,
            sender: event.info.sender,
            isFromMe: event.info.isFromMe,
            isGroup: event.info.isGroup,
            timestamp: event.info.timestamp,
            pushName: event.info.pushName,
          };
          const decrypted = await client.decryptReaction(infoRecord, event.message);
          reaction = parseDecryptedReactionPayload(decrypted, reactionWaId);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[WaManager] decryptReaction failed projectId=${this.projectId}: ${msg}`,
          );
        }
      }
    }

    if (reaction !== null) {
      await this.upsertEngagementReaction(event, reaction);
      return;
    }

    const reply = parseQuotedReplyEvent(event.message, event.info.id);
    if (reply !== null) {
      await this.upsertEngagementReply(event, reply);
    }
  }

  /**
   * Upserts a reaction keyed by (scheduledMessageId, reactorJid).
   * Empty emoji = removal (row retained so upserts stay idempotent).
   */
  private async upsertEngagementReaction(
    event: {
      info: { chat: string; sender: string; timestamp: number };
    },
    reaction: ParsedReactionEvent,
  ): Promise<void> {
    const row = await this.prisma.scheduledMessage.findFirst({
      where: {
        projectId: this.projectId,
        waMessageId: reaction.targetWaMessageId,
        groupJid: event.info.chat,
      },
      select: { id: true },
    });
    if (row === null) {
      return;
    }
    const reactedAt = waTimestampToDate(event.info.timestamp);
    await this.prisma.messageReaction.upsert({
      where: {
        scheduledMessageId_reactorJid: {
          scheduledMessageId: row.id,
          reactorJid: event.info.sender,
        },
      },
      create: {
        scheduledMessageId: row.id,
        reactorJid: event.info.sender,
        emoji: reaction.emoji,
        waReactionId: reaction.waReactionId,
        reactedAt,
      },
      update: {
        emoji: reaction.emoji,
        waReactionId: reaction.waReactionId,
        reactedAt,
      },
    });
  }

  /**
   * Upserts a quoted reply keyed by (scheduledMessageId, replyWaMessageId).
   * Only announcement-quote matches (caller already parsed stanzaId).
   */
  private async upsertEngagementReply(
    event: {
      info: { chat: string; sender: string; timestamp: number };
    },
    reply: ParsedReplyEvent,
  ): Promise<void> {
    const row = await this.prisma.scheduledMessage.findFirst({
      where: {
        projectId: this.projectId,
        waMessageId: reply.quotedWaMessageId,
        groupJid: event.info.chat,
      },
      select: { id: true },
    });
    if (row === null) {
      return;
    }
    const repliedAt = waTimestampToDate(event.info.timestamp);
    await this.prisma.messageReply.upsert({
      where: {
        scheduledMessageId_replyWaMessageId: {
          scheduledMessageId: row.id,
          replyWaMessageId: reply.replyWaMessageId,
        },
      },
      create: {
        scheduledMessageId: row.id,
        replyWaMessageId: reply.replyWaMessageId,
        replierJid: event.info.sender,
        bodyPreview: reply.bodyPreview,
        repliedAt,
      },
      update: {
        replierJid: event.info.sender,
        bodyPreview: reply.bodyPreview,
        repliedAt,
      },
    });
  }

  /**
   * After reconnect, fail SENDING rows that already stored a `waMessageId` but never got a receipt
   * within `WA_RECEIPT_TIMEOUT_MS` (covers process restarts that drop in-memory timers).
   */
  private async failStaleAcceptedSends(): Promise<void> {
    const timeoutMs = this.env.WA_RECEIPT_TIMEOUT_MS ?? DEFAULT_WA_RECEIPT_TIMEOUT_MS;
    const nowMs = Date.now();
    const candidates = await this.prisma.scheduledMessage.findMany({
      where: {
        projectId: this.projectId,
        status: "SENDING",
        waMessageId: { not: null },
        waAcceptedAt: { not: null },
      },
      select: {
        id: true,
        waMessageId: true,
        waAcceptedAt: true,
      },
      take: 100,
    });

    for (const row of candidates) {
      const waMessageId = row.waMessageId;
      const waAcceptedAt = row.waAcceptedAt;
      if (waMessageId === null || waAcceptedAt === null) {
        continue;
      }
      if (!isPastReceiptDeadline(waAcceptedAt, nowMs, timeoutMs)) {
        continue;
      }
      const error = buildNoReceiptErrorMessage(waMessageId);
      const result = await this.prisma.scheduledMessage.updateMany({
        where: {
          id: row.id,
          status: "SENDING",
          waMessageId,
        },
        data: {
          status: "FAILED",
          error: error.length > 2000 ? `${error.slice(0, 2000)}…` : error,
        },
      });
      if (result.count > 0) {
        console.warn(
          `[WaManager] stale no-receipt → FAILED id=${row.id} waMessageId=${waMessageId}`,
        );
      }
    }
  }

  private cancelQrRepairTimer(): void {
    if (this.qrRepairTimer !== undefined) {
      clearTimeout(this.qrRepairTimer);
      this.qrRepairTimer = undefined;
    }
  }

  /**
   * After QR channel timeout/error, wipe and open a fresh QR client (RAM freed first).
   * Stops after {@link WaManager.MAX_QR_REPAIR_ATTEMPTS} so the UI is not stuck forever.
   */
  private scheduleQrRepair(reason: string): void {
    if (this.isShuttingDown || this.isLoggedOut) {
      return;
    }
    if (this.qrRepairAttempts >= WaManager.MAX_QR_REPAIR_ATTEMPTS) {
      this.lastError =
        "QR never arrived after several tries. Use Link with phone number below, or set WA_MAX_WARM_CLIENTS=1 on the server.";
      this.uiState = "disconnected";
      this.bootPhase = undefined;
      console.error(
        `[WaManager] QR repair exhausted projectId=${this.projectId} attempts=${String(this.qrRepairAttempts)} reason=${reason}`,
      );
      return;
    }
    this.cancelQrRepairTimer();
    this.qrRepairTimer = setTimeout(() => {
      this.qrRepairTimer = undefined;
      this.waOpChain = this.waOpChain
        .then(async () => {
          const client = this.client;
          if (client !== undefined && (await this.safeIsLoggedIn(client))) {
            return;
          }
          this.qrRepairAttempts += 1;
          console.warn(
            `[WaManager] QR repair projectId=${this.projectId} reason=${reason} attempt=${String(this.qrRepairAttempts)}`,
          );
          this.latestQr = undefined;
          this.qrPairingActive = false;
          this.uiState = "disconnected";
          this.bootPhase = "qr_repair";
          if (client !== undefined) {
            await this.disposeClientQuietly(client);
            this.client = undefined;
          }
          await wipeWhatsAppStore(this.prisma, this.env, this.projectId);
          /** Always spawn QR under free RAM — never reuse a client created under pressure. */
          await this.openFreshQrPairing();
        })
        .catch((err: unknown) => {
          this.bootPhase = undefined;
          const message = err instanceof Error ? err.message : String(err);
          this.lastError = message;
          console.error(`[WaManager] QR repair failed projectId=${this.projectId}:`, err);
        });
    }, 3_000);
    this.qrRepairTimer.unref?.();
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Schedules a supervised reconnect attempt with exponential backoff.
   * Timers are canceled on `shutdown` and on `logged_out`.
   */
  private scheduleReconnect(reason: string): void {
    if (this.isShuttingDown || this.isLoggedOut) {
      return;
    }
    if (this.isQrLinkInProgress() || this.qrRepairTimer !== undefined) {
      return;
    }
    if (this.reconnectTimer !== undefined) {
      return;
    }

    const delayMs = this.reconnectBackoffMs;
    const next = Math.min(this.reconnectBackoffMs * 2, WaManager.RECONNECT_CAP_MS);
    this.reconnectBackoffMs = next;
    this.uiState = "connecting";

    console.warn(
      `[WaManager] scheduling reconnect projectId=${this.projectId} reason=${reason} delayMs=${String(delayMs)}`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.start().then(() => {
        if (this.uiState === "connected") {
          this.reconnectBackoffMs = WaManager.RECONNECT_BASE_MS;
          return;
        }
        this.scheduleReconnect("reconnect_attempt_failed");
      });
    }, delayMs);

    this.reconnectTimer.unref?.();
  }

  private async boot(): Promise<void> {
    this.uiState = "connecting";
    this.stopPersistTimer();
    this.stopGroupsRefreshLoop();
    this.latestQr = undefined;
    this.bootPhase = "hydrate";

    await hydrateWhatsAppSessionFromBlob(this.prisma, this.env, this.projectId);

    const store = resolveWhatsAppStoreUri(this.env, this.projectId);
    this.bootPhase = "create_client";
    const client = createClient({
      store,
      commandTimeout: WHATSAPP_COMMAND_TIMEOUT_MS,
    });
    this.attachClientEvents(client);
    this.client = client;

    this.bootPhase = "init";
    /** Cap init so a hung Go subprocess cannot block QR pairing for the full 120s IPC timeout. */
    const initResult = await withTimeout(client.init(), 40_000, "client.init");
    const afterInit = planPairingAfterInit(initResult.jid);

    if (afterInit === "connect_stored_session") {
      this.bootPhase = "reconnect_stored";
      await client.connect();
      const connectedOk = await client.waitForConnection(20_000);
      const loggedIn = connectedOk ? await this.safeIsLoggedIn(client) : false;
      console.info(
        `[WaManager] boot projectId=${this.projectId} storedSession=true connected=${String(connectedOk)} loggedIn=${String(loggedIn)}`,
      );
      if (loggedIn) {
        this.uiState = "connected";
        this.loggedInWaitFailures = 0;
        this.qrRepairAttempts = 0;
        this.bootPhase = undefined;
        this.startPersistTimer();
        this.ensureGroupsRefreshLoop();
        await this.safePersist();
        return;
      }

      const deadPlan = planPairingAfterDeadStoredSession();
      console.warn(
        `[WaManager] stored session unusable projectId=${this.projectId}; plan=${deadPlan}`,
      );
      this.bootPhase = "wipe_dead_session";
      await this.disposeClientQuietly(client);
      this.client = undefined;
      await wipeWhatsAppStore(this.prisma, this.env, this.projectId);
      await this.openFreshQrPairing();
      return;
    }

    /**
     * No stored JID — still dispose this client and re-spawn AFTER freeing RAM.
     * Spawning Go under memory pressure is why `awaiting_scan` never emits `qr`.
     */
    await this.disposeClientQuietly(client);
    this.client = undefined;
    await this.openFreshQrPairing();
  }

  /**
   * QR pairing under free RAM: evict other warm clients first, then spawn a fresh Go process.
   * Never call `getQRChannel` on a client that was `init()`'d while other clients were warm.
   */
  private async openFreshQrPairing(): Promise<void> {
    this.bootPhase = "prepare_ram";
    this.markQrPairingActive();
    if (this.onBeforeQrPairing !== undefined) {
      await this.onBeforeQrPairing();
    }
    this.markQrPairingActive();

    /** Ensure no leftover client/process before spawning. */
    const existing = this.client;
    if (existing !== undefined) {
      await this.disposeClientQuietly(existing);
      this.client = undefined;
    }

    await sleep(500);

    this.bootPhase = "create_client_qr";
    const store = resolveWhatsAppStoreUri(this.env, this.projectId);
    const client = createClient({
      store,
      commandTimeout: WHATSAPP_COMMAND_TIMEOUT_MS,
    });
    this.attachClientEvents(client);
    this.client = client;

    this.bootPhase = "init_qr";
    const initResult = await withTimeout(client.init(), 40_000, "qr.client.init");
    if (planPairingAfterInit(initResult.jid) === "connect_stored_session") {
      console.warn(
        `[WaManager] unexpected JID after wipe during QR open projectId=${this.projectId}; wiping again`,
      );
      await this.disposeClientQuietly(client);
      this.client = undefined;
      await wipeWhatsAppStore(this.prisma, this.env, this.projectId);
      await sleep(300);
      const retry = createClient({
        store: resolveWhatsAppStoreUri(this.env, this.projectId),
        commandTimeout: WHATSAPP_COMMAND_TIMEOUT_MS,
      });
      this.attachClientEvents(retry);
      this.client = retry;
      await withTimeout(retry.init(), 40_000, "qr.client.init.retry");
      this.bootPhase = "qr_channel";
      await retry.getQRChannel();
      this.bootPhase = "qr_connect";
      await retry.connect();
      this.bootPhase = "awaiting_scan";
      return;
    }

    this.bootPhase = "qr_channel";
    await client.getQRChannel();
    this.bootPhase = "qr_connect";
    await client.connect();
    this.bootPhase = "awaiting_scan";
    console.info(`[WaManager] QR channel open projectId=${this.projectId}; waiting for qr event`);
  }

  /**
   * Phone-number pairing fallback when QR never emits (common on low-RAM hosts).
   * WhatsApp → Linked devices → Link with phone number → enter the returned code.
   */
  async requestPairCode(phone: string): Promise<string> {
    const cleaned = phone.replace(/[^\d]/g, "");
    if (cleaned.length < 8 || cleaned.length > 15) {
      throw new Error("Phone must be digits only, country code included (no +)");
    }
    let issuedCode = "";
    this.waOpChain = this.waOpChain
      .then(async () => {
        issuedCode = await this.performRequestPairCode(cleaned);
      })
      .catch((err: unknown) => {
        console.error("[WaManager] pairCode chain failed:", err);
        throw err;
      });
    await this.waOpChain;
    if (issuedCode.length === 0) {
      throw new Error("Pairing code was not generated");
    }
    return issuedCode;
  }

  private async performRequestPairCode(phoneDigits: string): Promise<string> {
    this.cancelQrRepairTimer();
    this.latestQr = undefined;
    this.bootPhase = "pair_code_prepare";
    this.markQrPairingActive();
    if (this.onBeforeQrPairing !== undefined) {
      await this.onBeforeQrPairing();
    }

    const existing = this.client;
    if (existing !== undefined) {
      await this.disposeClientQuietly(existing);
      this.client = undefined;
    }
    await wipeWhatsAppStore(this.prisma, this.env, this.projectId);
    await sleep(500);

    const client = createClient({
      store: resolveWhatsAppStoreUri(this.env, this.projectId),
      commandTimeout: WHATSAPP_COMMAND_TIMEOUT_MS,
    });
    this.attachClientEvents(client);
    this.client = client;
    this.bootPhase = "pair_code_init";
    await withTimeout(client.init(), 40_000, "pairCode.client.init");
    /** Phone pairing requires connect() first — do not open a QR channel. */
    this.bootPhase = "pair_code_connect";
    this.uiState = "connecting";
    await client.connect();
    this.bootPhase = "pair_code_request";
    const code = await withTimeout(client.pairCode(phoneDigits), 30_000, "pairCode");
    this.bootPhase = "awaiting_pair_code";
    this.lastError = undefined;
    console.info(`[WaManager] pairCode issued projectId=${this.projectId}`);
    return code;
  }

  private startPersistTimer(): void {
    if (this.persistTimer !== undefined) {
      return;
    }
    this.persistTimer = setInterval(() => {
      void this.safePersist();
    }, WaManager.PERSIST_INTERVAL_MS);
    this.persistTimer.unref?.();
  }

  private stopPersistTimer(): void {
    if (this.persistTimer !== undefined) {
      clearInterval(this.persistTimer);
      this.persistTimer = undefined;
    }
  }

  /**
   * Starts periodic joined-groups refresh while connected.
   * Fires one uncached fetch immediately on first start, then every
   * {@link WaManager.GROUPS_REFRESH_INTERVAL_MS}. Idempotent if already looping.
   */
  private ensureGroupsRefreshLoop(): void {
    if (this.isShuttingDown || this.uiState !== "connected") {
      return;
    }
    if (this.groupsRefreshTimer !== undefined) {
      return;
    }
    void this.refreshJoinedGroupsSafe("connect");
    this.groupsRefreshTimer = setInterval(() => {
      void this.refreshJoinedGroupsSafe("interval");
    }, WaManager.GROUPS_REFRESH_INTERVAL_MS);
    this.groupsRefreshTimer.unref?.();
  }

  /** Stops the periodic groups refresh loop (disconnect / logout / shutdown). */
  private stopGroupsRefreshLoop(): void {
    if (this.groupsRefreshTimer !== undefined) {
      clearInterval(this.groupsRefreshTimer);
      this.groupsRefreshTimer = undefined;
    }
  }

  /**
   * Force-refreshes joined groups for the in-memory cache.
   * Swallows errors so a flaky IPC call never crashes the process.
   */
  private async refreshJoinedGroupsSafe(reason: "connect" | "interval"): Promise<void> {
    if (this.isShuttingDown || this.uiState !== "connected") {
      return;
    }
    const startedAt = Date.now();
    try {
      const options = await this.fetchGroupOptions(true);
      console.info(
        `[WaManager] groups refresh reason=${reason} projectId=${this.projectId} count=${String(options.length)} elapsedMs=${String(Date.now() - startedAt)}`,
      );
    } catch (err: unknown) {
      console.warn(
        `[WaManager] groups refresh failed reason=${reason} projectId=${this.projectId} elapsedMs=${String(Date.now() - startedAt)}:`,
        err,
      );
    }
  }

  private async safePersist(): Promise<void> {
    try {
      const meta = await persistWhatsAppSessionToBlob(this.prisma, this.env, this.projectId, {
        skipIfUnchanged: this.lastPersistMeta,
      });
      if (meta !== null) {
        this.lastPersistMeta = meta;
      }
    } catch (err: unknown) {
      console.error(`[WaManager] persist session failed projectId=${this.projectId}:`, err);
    }
  }

  private async safePersistAfterDelay(ms: number): Promise<void> {
    await sleep(ms);
    await this.safePersist();
  }

  /** `isLoggedIn` that never throws (defaults to false) so boot can fall back to QR linking. */
  private async safeIsLoggedIn(client: WhatsmeowClient): Promise<boolean> {
    try {
      return await client.isLoggedIn();
    } catch {
      return false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Rejects if `promise` does not settle within `ms`.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${String(ms)}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
