/**
 * One `WaManager` per `projectId` in this API process (whatsmeow-node + Postgres/SQLite store).
 */

import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";
import { WaManager } from "./wa-manager.js";

export class WaConnectionPool {
  private readonly env: ApiEnv;

  private readonly prisma: PrismaClient;

  private readonly managers = new Map<string, WaManager>();

  constructor(env: ApiEnv, prisma: PrismaClient) {
    this.env = env;
    this.prisma = prisma;
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
    return manager;
  }

  start(projectId: string): Promise<void> {
    return this.getManager(projectId).start();
  }

  async isSendReady(projectId: string): Promise<boolean> {
    return this.getManager(projectId).isSendReady();
  }

  async shutdownAll(): Promise<void> {
    const tasks = [...this.managers.values()].map((m) => m.shutdown());
    await Promise.all(tasks);
  }
}
