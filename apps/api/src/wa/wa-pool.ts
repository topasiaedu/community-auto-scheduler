/**
 * One `WaManager` per `projectId` in this API process (whatsmeow-node + Postgres/SQLite store).
 *
 * Memory guards for small Render instances:
 * - Warm clients are capped via LRU-shutdown.
 * - When `WA_ALWAYS_ON=true`, idle eviction is disabled (session stays alive).
 * - When `WA_ALWAYS_ON=false`, idle eviction shuts down quiet clients after a period.
 */

import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import type { WaStatusSnapshot } from "./wa-manager.js";
import { WaManager } from "./wa-manager.js";

export class WaConnectionPool {
  private readonly env: ApiEnv;

  private readonly prisma: PrismaClient;

  private readonly managers = new Map<string, WaManager>();

  private readonly idleSweepTimer: ReturnType<typeof setInterval> | undefined;

  private readonly alwaysOn: boolean;

  private readonly maxWarmClients: number;

  /**
   * ProjectIds that this API intentionally keeps warm in always-on mode.
   * Used to prevent the default session from being evicted when other projects get warmed.
   */
  private readonly pinnedProjectIds = new Set<string>();

  private static readonly DEFAULT_IDLE_EVICT_MS = 10 * 60_000;
  private static readonly IDLE_SWEEP_MS = 60_000;

  constructor(env: ApiEnv, prisma: PrismaClient) {
    this.env = env;
    this.prisma = prisma;
    this.alwaysOn = env.WA_ALWAYS_ON;
    this.maxWarmClients = env.WA_MAX_WARM_CLIENTS;

    if (!this.alwaysOn) {
      this.idleSweepTimer = setInterval(() => {
        void this.sweepIdleManagers();
      }, WaConnectionPool.IDLE_SWEEP_MS);
      this.idleSweepTimer.unref?.();
    } else {
      this.idleSweepTimer = undefined;
    }
  }

  getManager(projectId: string): WaManager {
    const trimmed = projectId.trim();
    if (trimmed.length === 0) {
      throw new Error("projectId must be non-empty");
    }
    let manager = this.managers.get(trimmed);
    if (manager === undefined) {
      manager = new WaManager(
        this.env,
        this.prisma,
        trimmed,
        /** Evict other warm clients just before QR pairing starts to free RAM on small hosts. */
        async () => {
          await this.prepareForQrPairing(trimmed);
        },
      );
      this.managers.set(trimmed, manager);
    }
    manager.touchActivity();
    void this.enforceMaxWarm(trimmed);
    return manager;
  }

  start(projectId: string): Promise<void> {
    return this.getManager(projectId).start();
  }

  async isSendReady(projectId: string): Promise<boolean> {
    return this.getManager(projectId).isSendReady();
  }

  /** Number of in-memory WaManagers (each may own a Go whatsmeow process). */
  getWarmClientCount(): number {
    return this.managers.size;
  }

  /**
   * Project ids that already have a manager in this process.
   * Does not create or start a session.
   */
  listWarmProjectIds(): string[] {
    return [...this.managers.keys()];
  }

  /**
   * In-memory status for a project that is already warm. Does not create or start a manager.
   * Returns null when the project has no live client in this process.
   */
  peekStatusSnapshot(projectId: string): WaStatusSnapshot | null {
    const manager = this.managers.get(projectId.trim());
    if (manager === undefined) {
      return null;
    }
    return manager.getStatusSnapshot();
  }

  /**
   * Send-ready check without creating a manager. Returns false when cold.
   */
  async peekIsSendReady(projectId: string): Promise<boolean> {
    const manager = this.managers.get(projectId.trim());
    if (manager === undefined) {
      return false;
    }
    return manager.isSendReady();
  }

  /**
   * Warms the default project after API startup (fire-and-forget friendly).
   * This keeps the session alive without waiting for UI polling.
   */
  warmDefaultProject(): void {
    if (!this.env.WA_ALWAYS_ON) {
      return;
    }
    const projectId = this.env.DEFAULT_PROJECT_ID.trim();
    if (projectId.length === 0) {
      return;
    }
    this.pinnedProjectIds.add(projectId);
    const manager = this.getManager(projectId);
    void manager.start().catch((err: unknown) => {
      console.error(`[wa-pool] warmDefaultProject failed projectId=${projectId}:`, err);
    });
  }

  /**
   * Warms additional projects that already have session blobs in Postgres.
   * The number of pinned projects is bounded by `WA_MAX_WARM_CLIENTS`.
   * Does not block API startup.
   */
  warmProjectsWithSessions(): void {
    if (!this.env.WA_ALWAYS_ON) {
      return;
    }

    const remainingPins = Math.max(0, this.maxWarmClients - this.pinnedProjectIds.size);
    if (remainingPins <= 0) {
      return;
    }

    void (async () => {
      const defaultId = this.env.DEFAULT_PROJECT_ID.trim();
      const rows = await this.prisma.whatsAppSessionBlob.findMany({
        select: { projectId: true },
        orderBy: { updatedAt: "desc" },
        take: remainingPins,
      });

      for (const row of rows) {
        const projectId = row.projectId;
        if (projectId.length === 0 || projectId === defaultId) {
          continue;
        }
        if (this.pinnedProjectIds.has(projectId)) {
          continue;
        }
        this.pinnedProjectIds.add(projectId);
        const manager = this.getManager(projectId);
        void manager.start().catch((err: unknown) => {
          console.error(`[wa-pool] warmProjectsWithSessions failed projectId=${projectId}:`, err);
        });
      }
    })().catch((err: unknown) => {
      console.error("[wa-pool] warmProjectsWithSessions failed:", err);
    });
  }

  async shutdownAll(): Promise<void> {
    if (this.idleSweepTimer !== undefined) {
      clearInterval(this.idleSweepTimer);
    }
    const tasks = [...this.managers.values()].map((m) => m.shutdown());
    await Promise.all(tasks);
    this.managers.clear();
    this.pinnedProjectIds.clear();
  }

  /**
   * Evicts other warm clients so only `keepProjectId` holds a Go subprocess.
   */
  private async enforceMaxWarm(keepProjectId: string): Promise<void> {
    if (this.managers.size <= this.maxWarmClients) {
      return;
    }

    const candidates = [...this.managers.entries()]
      .filter(
        ([id, manager]) =>
          id !== keepProjectId &&
          !this.pinnedProjectIds.has(id) &&
          !manager.isQrLinkInProgress(),
      )
      .sort((a, b) => a[1].getLastActivityAtMs() - b[1].getLastActivityAtMs());

    for (const [id, manager] of candidates) {
      if (this.managers.size <= this.maxWarmClients) {
        break;
      }
      console.info(`[wa-pool] max-warm eviction projectId=${id} keep=${keepProjectId}`);
      await manager.shutdown();
      this.managers.delete(id);
    }
  }

  /**
   * Frees RAM before QR pairing on small hosts: shut down every other warm client,
   * then mark the target project as mid-pairing so it is not evicted.
   * Pairing is marked first so `/wa/status` shows progress while others shut down.
   * Each peer shutdown is capped so one stuck Go process cannot block QR forever.
   */
  async prepareForQrPairing(projectId: string): Promise<void> {
    const keep = projectId.trim();
    if (keep.length === 0) {
      throw new Error("projectId must be non-empty");
    }
    const target = this.getManager(keep);
    target.markQrPairingActive();

    for (const [id, manager] of [...this.managers.entries()]) {
      if (id === keep) {
        continue;
      }
      console.info(`[wa-pool] freeing RAM for QR pairing; shutting down projectId=${id}`);
      try {
        await Promise.race([
          manager.shutdown(),
          new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`shutdown timed out for projectId=${id}`));
            }, 12_000);
          }),
        ]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[wa-pool] peer shutdown during QR prep failed projectId=${id}: ${message}`);
      }
      this.managers.delete(id);
      this.pinnedProjectIds.delete(id);
    }
    target.markQrPairingActive();
  }

  /**
   * Shuts down managers that have been idle and are not mid-QR linking.
   */
  private async sweepIdleManagers(): Promise<void> {
    if (this.alwaysOn) {
      return;
    }
    const now = Date.now();
    for (const [id, manager] of [...this.managers.entries()]) {
      if (manager.isQrLinkInProgress()) {
        continue;
      }
      const idleFor = now - manager.getLastActivityAtMs();
      if (idleFor < WaConnectionPool.DEFAULT_IDLE_EVICT_MS) {
        continue;
      }
      console.info(
        `[wa-pool] idle-evict projectId=${id} idleMs=${String(idleFor)}`,
      );
      await manager.shutdown();
      this.managers.delete(id);
    }
  }
}
