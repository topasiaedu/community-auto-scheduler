/**
 * One `WaManager` per `projectId` in this API process (Baileys + Supabase Storage session prefix).
 */

import type { WASocket } from "@whiskeysockets/baileys";
import type { ApiEnv } from "../env.js";
import { WaManager } from "./wa-manager.js";

export class WaConnectionPool {
  private readonly env: ApiEnv;

  private readonly managers = new Map<string, WaManager>();

  constructor(env: ApiEnv) {
    this.env = env;
  }

  /**
   * Returns the existing manager or constructs one for this `projectId`.
   */
  getManager(projectId: string): WaManager {
    const trimmed = projectId.trim();
    if (trimmed.length === 0) {
      throw new Error("projectId must be non-empty");
    }
    let manager = this.managers.get(trimmed);
    if (manager === undefined) {
      manager = new WaManager(this.env, trimmed);
      this.managers.set(trimmed, manager);
    }
    return manager;
  }

  /**
   * Ensures Baileys is booting or connected for `projectId` (used by HTTP routes and the worker).
   */
  start(projectId: string): Promise<void> {
    return this.getManager(projectId).start();
  }

  /**
   * Active socket for `projectId`, if that manager is connected.
   */
  getSocket(projectId: string): WASocket | undefined {
    return this.getManager(projectId).getSocket();
  }

  /**
   * Best-effort shutdown for every live manager (process exit).
   */
  async shutdownAll(): Promise<void> {
    const tasks = [...this.managers.values()].map((m) => m.shutdown());
    await Promise.all(tasks);
  }
}
