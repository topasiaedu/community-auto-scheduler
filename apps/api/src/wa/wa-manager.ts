/**
 * One whatsmeow-node client per `projectId` (Postgres schema or SQLite file per project).
 * A `WaConnectionPool` owns one `WaManager` per project in the API process.
 */

import { createClient, type WhatsmeowClient } from "@whatsmeow-node/whatsmeow-node";
import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import { sendGroupImage, sendGroupPoll, sendGroupText, withTempImageFile } from "./wa-send.js";
import {
  ensurePostgresWhatsAppSchema,
  ensureSqliteStoreDir,
  isPostgresStoreUrl,
  resolveWhatsAppStoreBase,
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
   * Human-readable row for the picker. Currently the group subject (best-effort): whatsmeow's
   * serial IPC makes per-group community lookups too slow and they would block sends.
   */
  label: string;
};

function isPostgresStore(env: ApiEnv): boolean {
  return isPostgresStoreUrl(resolveWhatsAppStoreBase(env));
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

  /** Cached group picker options; community detection is expensive so results are reused. */
  private groupCache: { fetchedAt: number; options: WaGroupOption[] } | undefined;

  /** De-duplicates concurrent group fetches (the UI polls `/wa/groups` repeatedly). */
  private groupFetchInFlight: Promise<WaGroupOption[]> | undefined;

  /** How long a successful group fetch is reused before refetching. */
  private static readonly GROUP_CACHE_TTL_MS = 5 * 60_000;

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

  /**
   * Ensures the client is booting or connected.
   */
  start(): Promise<void> {
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
   *
   * Results are cached (TTL) and concurrent calls are de-duplicated because community detection
   * issues one `getSubGroups` call per joined group; without this the repeated `/wa/groups` polls
   * stack up multi-second fetches. Pass `forceRefresh` (the "Load groups" button) to bypass cache.
   */
  async fetchGroupOptions(forceRefresh = false): Promise<WaGroupOption[]> {
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
      // Single IPC call only. We deliberately do NOT call `getSubGroups` per group for community
      // labels: the whatsmeow Go subprocess processes IPC commands serially, so per-group lookups
      // both take ~75s for large accounts and would block scheduled sends queued behind them.
      const startedAt = Date.now();
      const groups = await client.getJoinedGroups();
      console.info(
        `[WaManager] getJoinedGroups projectId=${this.projectId} count=${String(groups.length)} elapsedMs=${String(Date.now() - startedAt)}`,
      );

      const out: WaGroupOption[] = [];
      for (const g of groups) {
        if (!g.jid.endsWith("@g.us")) {
          continue;
        }
        const nameRaw = typeof g.name === "string" ? g.name.trim() : "";
        const name = nameRaw.length > 0 ? nameRaw : "";
        const label = name.length > 0 ? name : "(unnamed group)";
        out.push({ jid: g.jid, name, label });
      }

      out.sort((a, b) => {
        const byLabel = a.label.localeCompare(b.label);
        return byLabel !== 0 ? byLabel : a.jid.localeCompare(b.jid);
      });
      this.groupCache = { fetchedAt: Date.now(), options: out };
      return out;
    } catch {
      return [];
    }
  }

  async sendPost(groupJid: string, text: string, imageBuffer: Buffer | undefined, mimetype: string): Promise<void> {
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
    const client = this.client;
    if (client === undefined) {
      throw new Error("WhatsApp client is not initialized");
    }
    await sendGroupPoll(client, groupJid, question, options, selectableCount);
  }

  async sendDirectText(msisdnJid: string, text: string): Promise<void> {
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
        }
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
      // Let the Go subprocess release SQLite handles before we delete session files (Windows EBUSY).
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
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
    });

    client.on("disconnected", () => {
      if (this.uiState === "connected") {
        this.uiState = "connecting";
      }
    });

    client.on("logged_out", () => {
      this.uiState = "disconnected";
      this.latestQr = undefined;
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

    if (isPostgresStore(this.env)) {
      await ensurePostgresWhatsAppSchema(this.prisma, this.projectId);
    } else {
      await ensureSqliteStoreDir(this.env, this.projectId);
    }

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
      // Only report "connected" when the device is actually logged in. A stale stored session can
      // connect at the websocket level (false green) while real queries (groups/sends) hang.
      if (loggedIn) {
        this.uiState = "connected";
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
    }

    await client.getQRChannel();
    await client.connect();
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
