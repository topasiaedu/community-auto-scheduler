/**
 * Single Baileys socket for one `projectId` (Storage prefix `sessions/{projectId}/…`).
 * A `WaConnectionPool` owns one `WaManager` per project in the API process.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type ConnectionState,
  type GroupMetadata,
  type WASocket,
} from "@whiskeysockets/baileys";
import { isBoom } from "@hapi/boom";
import pino from "pino";
import {
  getSessionStoragePrefix,
  useSupabaseMultiFileAuthState,
} from "@nmcas/wa-session-storage";
import type { ApiEnv } from "../env.js";

export type WaConnectionUiState = "disconnected" | "connecting" | "connected";

const baileysLogger = pino({ level: "warn" });

/**
 * Cached WA version tuple. `fetchLatestBaileysVersion()` makes an HTTP request to GitHub;
 * calling it on every reconnect (515 restart every pairing) adds unnecessary latency.
 */
let cachedWaVersion: [number, number, number] | undefined;

export type WaGroupOption = {
  jid: string;
  /** Raw WhatsApp group title (`subject`). */
  name: string;
  /**
   * Human-readable row for the picker: when the group is linked to a community,
   * `"<Community subject> › <group subject>"` so "Announcement" rows are distinguishable.
   */
  label: string;
};

function resolveParentCommunityTitle(
  metaById: Record<string, GroupMetadata>,
  parentJid: string,
): string {
  const parent = metaById[parentJid];
  const subj = parent?.subject?.trim();
  if (subj !== undefined && subj.length > 0) {
    return subj;
  }
  const local = parentJid.split("@")[0] ?? "";
  return local.length > 8 ? `…${local.slice(-6)}` : parentJid;
}

/**
 * Builds a list label from Baileys metadata. Uses `linkedParent` (community JID) when present
 * so subgroups like "Announcement" show which community they belong to.
 */
function buildGroupListLabel(meta: GroupMetadata, metaById: Record<string, GroupMetadata>): string {
  const subjectRaw = typeof meta.subject === "string" ? meta.subject.trim() : "";
  const subject = subjectRaw.length > 0 ? subjectRaw : "(unnamed group)";

  const linked = meta.linkedParent?.trim();
  if (linked !== undefined && linked.length > 0) {
    const parentTitle = resolveParentCommunityTitle(metaById, linked);
    return `${parentTitle} › ${subject}`;
  }
  return subject;
}

export class WaManager {
  private readonly env: ApiEnv;

  /** Prisma / Storage project id for this socket (session objects live under `sessions/{projectId}/`). */
  private readonly projectId: string;

  private supabase: SupabaseClient;

  private socket: WASocket | undefined;

  private latestQr: string | undefined;

  private uiState: WaConnectionUiState = "disconnected";

  /**
   * One in-process queue for tear-down, boot, Storage wipes, and disconnect recovery.
   * Prevents overlapping `makeWASocket` calls (runtime evidence: double `boot:socket` → self-440).
   */
  private waOpChain: Promise<void> = Promise.resolve();

  private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  /**
   * Serialized `saveCreds` calls so a disconnect/reboot does not read Storage
   * before the last cred write from pairing or `restartRequired` finishes.
   */
  private credsSaveChain: Promise<void> = Promise.resolve();

  constructor(env: ApiEnv, projectId: string) {
    const trimmed = projectId.trim();
    if (trimmed.length === 0) {
      throw new Error("WaManager requires a non-empty projectId");
    }
    this.env = env;
    this.projectId = trimmed;
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /**
   * High-level connection state for HTTP polling (P2; SSE/WebSocket later).
   */
  getUiState(): WaConnectionUiState {
    return this.uiState;
  }

  /**
   * Raw QR payload for WhatsApp multi-device linking, when `uiState` is not `connected`.
   */
  getLatestQr(): string | undefined {
    return this.latestQr;
  }

  /**
   * Returns the active socket when connected; otherwise `undefined`.
   */
  getSocket(): WASocket | undefined {
    return this.socket;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      globalThis.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Waits for in-flight `saveCreds` work from the current or previous socket generation.
   */
  private async flushCredSaves(): Promise<void> {
    try {
      await this.credsSaveChain;
    } catch (err: unknown) {
      baileysLogger.warn({ err }, "Cred save chain rejected before continuing WaManager flow");
    }
  }

  /**
   * Baileys `WebSocketClient` forwards the underlying `ws` "close" event; wait for it after calling `close()`.
   */
  private async closeWebSocketTransport(ws: WASocket["ws"]): Promise<void> {
    if (ws.isClosed) {
      return;
    }
    await new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
      try {
        ws.close();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Resolves when Baileys emits the first meaningful lifecycle signal for this boot.
   * Without this, `boot()` returned immediately after registering listeners, so the next `waOpChain`
   * step ran `tearDownLiveSocketIfAny()` and killed the socket we had just created (runtime log:
   * `boot:socket` then `tearDown` on the same millisecond).
   */
  private waitForBootHandshake(sock: WASocket): Promise<void> {
    return new Promise((resolve) => {
      const onUpdate = (update: Partial<ConnectionState>): void => {
        const { connection, qr } = update;
        if (typeof qr === "string" && qr.length > 0) {
          sock.ev.off("connection.update", onUpdate);
          resolve();
          return;
        }
        if (connection === "open" || connection === "close") {
          sock.ev.off("connection.update", onUpdate);
          resolve();
        }
      };
      sock.ev.on("connection.update", onUpdate);
    });
  }

  /**
   * Clears `this.socket`, closes the previous Baileys WebSocket, and waits for `close` before the next boot.
   */
  private async tearDownLiveSocketIfAny(): Promise<void> {
    const old = this.socket;
    if (old === undefined) {
      return;
    }
    this.socket = undefined;
    await this.closeWebSocketTransport(old.ws);
  }

  /**
   * Ensures a Baileys socket exists and is not torn down unnecessarily.
   * HTTP routes poll `/wa/status` and `/wa/qr`; calling `tearDown`+`boot` on every poll
   * kills the WebSocket and produces tight `connectionClosed` (428) loops.
   */
  start(): Promise<void> {
    this.waOpChain = this.waOpChain
      .then(() => this.ensureRunning())
      .catch((err: unknown) => {
        baileysLogger.error({ err }, "WaManager boot chain failed");
      });
    return this.waOpChain;
  }

  /**
   * Boots only when there is no live transport. Reuses an existing open WebSocket
   * so UI polling does not interrupt the handshake or stable session.
   */
  private async ensureRunning(): Promise<void> {
    const sock = this.socket;
    const wsClosed = sock === undefined ? true : sock.ws.isClosed;
    if (sock !== undefined && !wsClosed) {
      return;
    }
    await this.tearDownLiveSocketIfAny();
    await this.boot();
  }

  /**
   * Groups the linked account participates in (for schedule UI picker).
   * Excludes **community shells** (`isCommunity`): those JIDs are containers, not chats you can post to.
   * `label` includes the parent community title when Baileys provides `linkedParent` (linked subgroups).
   */
  async fetchGroupOptions(): Promise<WaGroupOption[]> {
    await this.start();
    const sock = this.socket;
    if (sock === undefined) {
      return [];
    }
    try {
      const metaById = (await sock.groupFetchAllParticipating()) as Record<string, GroupMetadata>;
      const out: WaGroupOption[] = [];
      for (const jid of Object.keys(metaById)) {
        if (!jid.endsWith("@g.us")) {
          continue;
        }
        const meta = metaById[jid];
        if (meta === undefined) {
          continue;
        }
        if (meta.isCommunity === true) {
          continue;
        }
        const name =
          typeof meta.subject === "string" && meta.subject.trim().length > 0
            ? meta.subject.trim()
            : "";
        const label = buildGroupListLabel(meta, metaById);
        out.push({ jid, name, label });
      }
      out.sort((a, b) => {
        const byLabel = a.label.localeCompare(b.label);
        return byLabel !== 0 ? byLabel : a.jid.localeCompare(b.jid);
      });
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Closes the socket on process shutdown (best-effort).
   */
  async shutdown(): Promise<void> {
    this.clearReconnectTimer();
    const sock = this.socket;
    this.socket = undefined;
    this.uiState = "disconnected";
    this.latestQr = undefined;
    if (sock !== undefined) {
      try {
        sock.ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Deletes Baileys session objects for this `projectId` in Storage, then boots a fresh socket (new QR).
   * Use when the UI stays on "connecting" with no QR (stale creds after 401 / bad session).
   */
  resetSessionForLinking(): Promise<void> {
    this.waOpChain = this.waOpChain
      .then(() => this.performResetSessionForLinking())
      .catch((err: unknown) => {
        baileysLogger.error({ err }, "WaManager reset chain failed");
      });
    return this.waOpChain;
  }

  private async performResetSessionForLinking(): Promise<void> {
    await this.tearDownLiveSocketIfAny();
    await this.flushCredSaves();
    this.latestQr = undefined;
    this.uiState = "disconnected";
    await this.wipeSessionObjectsFromStorage();
    await this.boot();
  }

  private shouldWipeStoredSessionOnDisconnect(code: number | undefined): boolean {
    if (code === undefined) {
      return false;
    }
    return (
      code === DisconnectReason.loggedOut ||
      code === DisconnectReason.badSession ||
      code === DisconnectReason.multideviceMismatch
    );
  }

  /**
   * Removes all objects under `sessions/{projectId}/` so the next boot uses `initAuthCreds()` and can show a QR.
   */
  private async wipeSessionObjectsFromStorage(): Promise<void> {
    const bucket = this.env.NMCAS_SESSION_BUCKET;
    const folder = getSessionStoragePrefix(this.projectId).replace(/\/$/, "");
    const pageSize = 100;
    let offset = 0;
    for (;;) {
      const { data, error } = await this.supabase.storage.from(bucket).list(folder, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error !== null) {
        throw new Error(`Storage list failed (${folder}): ${error.message}`);
      }
      if (data === null || data.length === 0) {
        break;
      }
      const paths = data
        .filter((item) => typeof item.name === "string" && item.name.length > 0)
        .map((item) => `${folder}/${item.name}`);
      const chunkSize = 50;
      for (let i = 0; i < paths.length; i += chunkSize) {
        const chunk = paths.slice(i, i + chunkSize);
        const { error: removeError } = await this.supabase.storage.from(bucket).remove(chunk);
        if (removeError !== null) {
          throw new Error(`Storage remove failed: ${removeError.message}`);
        }
      }
      if (data.length < pageSize) {
        break;
      }
      offset += pageSize;
    }
  }

  /**
   * Schedules a new boot after a close. Uses a long delay for `connectionReplaced` (440) so we do not fight
   * another WhatsApp Web / linked-device session in a tight loop. Cancels any prior scheduled reconnect.
   */
  private scheduleBootAfterClose(wipe: boolean, code: number | undefined): void {
    this.clearReconnectTimer();
    let delayMs = 2500;
    if (wipe) {
      delayMs = 1500;
    } else if (code === DisconnectReason.connectionReplaced) {
      delayMs = 45_000;
    } else if (code === DisconnectReason.restartRequired) {
      delayMs = 500;
    } else if (code === DisconnectReason.connectionClosed) {
      delayMs = 8000;
    }
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.start();
    }, delayMs);
  }

  private handleConnectionClosed(
    closedSock: WASocket | undefined,
    code: number | undefined,
  ): void {
    this.waOpChain = this.waOpChain
      .then(async () => {
        await this.flushCredSaves();
        this.uiState = "disconnected";
        this.latestQr = undefined;
        const sockToClose = closedSock;
        this.socket = undefined;
        if (sockToClose !== undefined) {
          await this.closeWebSocketTransport(sockToClose.ws);
        }
        await this.flushCredSaves();
        const wipe = this.shouldWipeStoredSessionOnDisconnect(code);
        if (wipe) {
          try {
            await this.wipeSessionObjectsFromStorage();
          } catch (err) {
            baileysLogger.warn({ err }, "Session storage wipe after fatal disconnect failed");
          }
        }
        this.scheduleBootAfterClose(wipe, code);
      })
      .catch((err: unknown) => {
        baileysLogger.error({ err }, "WaManager disconnect recovery chain failed");
      });
  }

  private async boot(): Promise<void> {
    this.uiState = "connecting";
    if (cachedWaVersion === undefined) {
      const { version } = await fetchLatestBaileysVersion();
      cachedWaVersion = version;
    }
    const { state, saveCreds } = await useSupabaseMultiFileAuthState(
      this.supabase,
      this.env.NMCAS_SESSION_BUCKET,
      this.projectId,
    );
    const sock = makeWASocket({
      auth: state,
      version: cachedWaVersion,
      logger: baileysLogger,
      printQRInTerminal: false,
      browser: ["NMCAS", "Chrome", "1.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    this.socket = sock;

    sock.ev.on("creds.update", () => {
      this.credsSaveChain = this.credsSaveChain
        .then(() => saveCreds())
        .catch((err: unknown) => {
          baileysLogger.error(
            { err },
            "Failed to persist WhatsApp creds to Storage (link may still work until restart; fix network or Supabase config)",
          );
        });
    });

    const handshakePromise = this.waitForBootHandshake(sock);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (typeof qr === "string" && qr.length > 0) {
        this.latestQr = qr;
      }
      if (connection === "close") {
        const err = lastDisconnect?.error;
        const code =
          err !== undefined && isBoom(err) ? err.output.statusCode : undefined;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        baileysLogger.warn(
          { code, shouldReconnect },
          "WhatsApp connection closed",
        );
        const closedSock = this.socket;
        this.handleConnectionClosed(closedSock, code);
      } else if (connection === "open") {
        this.uiState = "connected";
        this.latestQr = undefined;
      }
    });

    await handshakePromise;
  }
}
