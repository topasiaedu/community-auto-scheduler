/**
 * One whatsmeow-node client per `projectId` (SQLite file hydrated from Postgres blob).
 * A `WaConnectionPool` owns one `WaManager` per project in the API process.
 */

import {
  createClient,
  type GroupInfo,
  type WhatsmeowClient,
} from "@whatsmeow-node/whatsmeow-node";
import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import { sendGroupImage, sendGroupPoll, sendGroupSticker, sendGroupText, withTempImageFile } from "./wa-send.js";
import {
  hydrateWhatsAppSessionFromBlob,
  persistWhatsAppSessionToBlob,
  resolveWhatsAppStoreUri,
  WHATSAPP_COMMAND_TIMEOUT_MS,
  wipeWhatsAppStore,
} from "./whatsapp-store.js";

export type WaConnectionUiState = "disconnected" | "connecting" | "connected";

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

  /** Local SQLite fingerprint after last successful blob upload (skip unchanged persists). */
  private lastPersistMeta: { size: number; mtimeMs: number } | undefined;

  /** Last API/worker touch — used by `WaConnectionPool` idle eviction. */
  private lastActivityAtMs: number = Date.now();

  private static readonly GROUP_CACHE_TTL_MS = 5 * 60_000;

  /** Was 60s; 8MB session re-read every minute caused avoidable heap spikes on 512MB. */
  private static readonly PERSIST_INTERVAL_MS = 5 * 60_000;

  constructor(env: ApiEnv, prisma: PrismaClient, projectId: string) {
    const trimmed = projectId.trim();
    if (trimmed.length === 0) {
      throw new Error("WaManager requires a non-empty projectId");
    }
    this.env = env;
    this.prisma = prisma;
    this.projectId = trimmed;
  }

  getUiState(): WaConnectionUiState {
    return this.uiState;
  }

  getLatestQr(): string | undefined {
    return this.latestQr;
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
   * True while a QR is on screen — pool must not idle-evict mid-scan.
   */
  isQrLinkInProgress(): boolean {
    return this.getLatestQr() !== undefined;
  }

  /**
   * Ensures the client is booting or connected.
   */
  start(): Promise<void> {
    this.touchActivity();
    this.waOpChain = this.waOpChain
      .then(() => this.ensureRunning())
      .catch((err: unknown) => {
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
      return await client.isConnected();
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
      const groups = await client.getJoinedGroups();
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
    } catch {
      return [];
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

  async sendPost(groupJid: string, text: string, imageBuffer: Buffer | undefined, mimetype: string): Promise<void> {
    this.touchActivity();
    const client = this.client;
    if (client === undefined) {
      throw new Error("WhatsApp client is not initialized");
    }
    if (imageBuffer !== undefined) {
      await withTempImageFile(imageBuffer, mimetype, async (filePath) => {
        await sendGroupImage(client, groupJid, filePath, text, mimetype);
      });
      return;
    }
    await sendGroupText(client, groupJid, text);
  }

  async sendPoll(
    groupJid: string,
    question: string,
    options: string[],
    selectableCount: number,
  ): Promise<void> {
    this.touchActivity();
    const client = this.client;
    if (client === undefined) {
      throw new Error("WhatsApp client is not initialized");
    }
    await sendGroupPoll(client, groupJid, question, options, selectableCount);
  }

  async sendSticker(groupJid: string, stickerBuffer: Buffer): Promise<void> {
    this.touchActivity();
    const client = this.client;
    if (client === undefined) {
      throw new Error("WhatsApp client is not initialized");
    }
    await withTempImageFile(stickerBuffer, "image/webp", async (filePath) => {
      await sendGroupSticker(client, groupJid, filePath);
    });
  }

  async sendDirectText(msisdnJid: string, text: string): Promise<void> {
    this.touchActivity();
    const client = this.client;
    if (client === undefined) {
      throw new Error("WhatsApp client is not initialized");
    }
    await sendGroupText(client, msisdnJid, text);
  }

  /**
   * Closes the client on process shutdown (best-effort).
   */
  async shutdown(): Promise<void> {
    this.waOpChain = this.waOpChain
      .then(async () => {
        this.stopPersistTimer();
        const client = this.client;
        this.client = undefined;
        this.uiState = "disconnected";
        this.latestQr = undefined;
        this.groupCache = undefined;
        if (client !== undefined) {
          try {
            await client.disconnect();
          } catch {
            /* ignore */
          }
          client.close();
          await sleep(300);
        }
        await this.safePersist();
      })
      .catch((err: unknown) => {
        console.error("[WaManager] shutdown failed:", err);
      });
    await this.waOpChain;
  }

  /**
   * Wipes session store and boots a fresh client (new QR).
   */
  resetSessionForLinking(): Promise<void> {
    this.waOpChain = this.waOpChain
      .then(() => this.performResetSessionForLinking())
      .catch((err: unknown) => {
        console.error("[WaManager] reset chain failed:", err);
        throw err;
      });
    return this.waOpChain;
  }

  private async performResetSessionForLinking(): Promise<void> {
    this.stopPersistTimer();
    this.lastPersistMeta = undefined;
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
    await this.ensureRunning();
  }

  private async ensureRunning(): Promise<void> {
    const existing = this.client;
    if (existing !== undefined) {
      try {
        if (await existing.isConnected()) {
          this.uiState = "connected";
          return;
        }
        if (await existing.isLoggedIn()) {
          this.uiState = "connecting";
          await existing.connect();
          const ok = await existing.waitForConnection(30_000);
          this.uiState = ok ? "connected" : "connecting";
          if (ok) {
            this.startPersistTimer();
            await this.safePersist();
          }
          return;
        }
      } catch {
        /* tear down and full boot */
      }
      try {
        await existing.disconnect();
      } catch {
        /* ignore */
      }
      existing.close();
      this.client = undefined;
    }
    await this.boot();
  }

  private attachClientEvents(client: WhatsmeowClient): void {
    client.on("qr", ({ code }) => {
      this.latestQr = code;
      this.uiState = "connecting";
    });

    client.on("connected", () => {
      this.uiState = "connected";
      this.latestQr = undefined;
      this.startPersistTimer();
      void this.safePersistAfterDelay(1500);
    });

    client.on("disconnected", () => {
      if (this.uiState === "connected") {
        this.uiState = "connecting";
      }
    });

    client.on("logged_out", () => {
      this.uiState = "disconnected";
      this.latestQr = undefined;
      this.stopPersistTimer();
      void wipeWhatsAppStore(this.prisma, this.env, this.projectId).catch((err: unknown) => {
        console.error(`[WaManager] wipe after logout failed projectId=${this.projectId}:`, err);
      });
    });

    client.on("error", (err: Error) => {
      console.error(`[WaManager] client error projectId=${this.projectId}:`, err.message);
    });

    client.on("exit", ({ code }) => {
      if (code !== null && code !== 0) {
        console.error(`[WaManager] Go subprocess exited projectId=${this.projectId} code=${String(code)}`);
        this.uiState = "disconnected";
      }
    });
  }

  private async boot(): Promise<void> {
    this.uiState = "connecting";
    this.stopPersistTimer();

    await hydrateWhatsAppSessionFromBlob(this.prisma, this.env, this.projectId);

    const store = resolveWhatsAppStoreUri(this.env, this.projectId);
    const client = createClient({
      store,
      commandTimeout: WHATSAPP_COMMAND_TIMEOUT_MS,
    });
    this.attachClientEvents(client);
    this.client = client;

    const initResult = await client.init();
    const hasStoredSession = initResult.jid !== undefined && initResult.jid.length > 0;
    if (hasStoredSession) {
      await client.connect();
      const connectedOk = await client.waitForConnection(30_000);
      const loggedIn = connectedOk ? await this.safeIsLoggedIn(client) : false;
      console.info(
        `[WaManager] boot projectId=${this.projectId} storedSession=true connected=${String(connectedOk)} loggedIn=${String(loggedIn)}`,
      );
      if (loggedIn) {
        this.uiState = "connected";
        this.startPersistTimer();
        await this.safePersist();
        return;
      }
      console.warn(
        `[WaManager] stored session is not logged in projectId=${this.projectId}; re-linking via QR`,
      );
      try {
        await client.logout();
      } catch {
        /* may already be logged out */
      }
      try {
        await client.disconnect();
      } catch {
        /* ignore */
      }
      await wipeWhatsAppStore(this.prisma, this.env, this.projectId);
    }

    await client.getQRChannel();
    await client.connect();
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
