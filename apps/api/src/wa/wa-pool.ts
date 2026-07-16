/**
 * One `WaManager` per `projectId` in this API process (whatsmeow-node + Postgres/SQLite store).
 *
 * Memory guards for small Render instances:
 * - At most one warm WhatsApp (Go) client.
 * - Idle clients are shut down after a quiet period (worker/`start` boots on demand).
 */

import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import { WaManager } from "./wa-manager.js";

export class WaConnectionPool {
  private readonly env: ApiEnv;

  private readonly prisma: PrismaClient;

  private readonly managers = new Map<string, WaManager>();

  private readonly idleSweepTimer: ReturnType<typeof setInterval>;

  /** Keep only one Go subprocess warm — enough for single-project production. */
  private static readonly MAX_WARM_CLIENTS = 1;

  /** Shut down WA after this much idle time (dashboard closed / no sends). */
  private static readonly IDLE_EVICT_MS = 10 * 60_000;

  private static readonly IDLE_SWEEP_MS = 60_000;

  constructor(env: ApiEnv, prisma: PrismaClient) {
    this.env = env;
    this.prisma = prisma;
    this.idleSweepTimer = setInterval(() => {
      void this.sweepIdleManagers();
    }, WaConnectionPool.IDLE_SWEEP_MS);
    this.idleSweepTimer.unref?.();
  }

  getManager(projectId: string): WaManager {
    const trimmed = projectId.trim();
    if (trimmed.length === 0) {
      throw new Error("projectId must be non-empty");
    }
    let manager = this.managers.get(trimmed);
    if (manager === undefined) {
      manager = new WaManager(this.env, this.prisma, trimmed);
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

  async shutdownAll(): Promise<void> {
    clearInterval(this.idleSweepTimer);
    const tasks = [...this.managers.values()].map((m) => m.shutdown());
    await Promise.all(tasks);
    this.managers.clear();
  }

  /**
   * Evicts other warm clients so only `keepProjectId` holds a Go subprocess.
   */
  private async enforceMaxWarm(keepProjectId: string): Promise<void> {
    if (this.managers.size <= WaConnectionPool.MAX_WARM_CLIENTS) {
      return;
    }
    for (const [id, manager] of [...this.managers.entries()]) {
      if (id === keepProjectId) {
        continue;
      }
      if (manager.isQrLinkInProgress()) {
        continue;
      }
      console.info(`[wa-pool] max-warm eviction projectId=${id} keep=${keepProjectId}`);
      await manager.shutdown();
      this.managers.delete(id);
    }
  }

  /**
   * Shuts down managers that have been idle and are not mid-QR linking.
   */
  private async sweepIdleManagers(): Promise<void> {
    const now = Date.now();
    for (const [id, manager] of [...this.managers.entries()]) {
      if (manager.isQrLinkInProgress()) {
        continue;
      }
      const idleFor = now - manager.getLastActivityAtMs();
      if (idleFor < WaConnectionPool.IDLE_EVICT_MS) {
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
