/**
 * One whatsmeow-node client per `projectId` (SQLite file hydrated from Postgres blob).
 * A `WaConnectionPool` owns one `WaManager` per project in the API process.
 */

import { createClient, type WhatsmeowClient } from "@whatsmeow-node/whatsmeow-node";
import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import { sendGroupImage, sendGroupPoll, sendGroupText, withTempImageFile } from "./wa-send.js";
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
   * Human-readable row for the picker. Currently the group subject (best-effort): whatsmeow's
   * serial IPC makes per-group community lookups too slow and they would block sends.
   */
  label: string;
};

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

  private static readonly GROUP_CACHE_TTL_MS = 5 * 60_000;

  private static readonly PERSIST_INTERVAL_MS = 60_000;

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
      await persistWhatsAppSessionToBlob(this.prisma, this.env, this.projectId);
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
