/**
 * Supabase Auth JWT verification for Fastify (`Authorization: Bearer`).
 * Project scope: any authenticated user may use any existing project (`X-Project-Id`) — no per-user membership.
 */

import { createClient } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "@nmcas/db";
import type { ApiEnv } from "../env.js";

/**
 * Parses `Authorization: Bearer <jwt>` and returns the trimmed token, if present.
 */
export function extractBearerToken(header: string | string[] | undefined): string | undefined {
  if (typeof header !== "string" || header.length < 8) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  if (token === undefined || token.length === 0) {
    return undefined;
  }
  return token;
}

/**
 * Verifies the Supabase JWT and attaches `req.authUserId`.
 */
export function createRequireAuthPreHandler(env: ApiEnv): preHandlerHookHandler {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = extractBearerToken(req.headers.authorization);
    if (token === undefined) {
      await reply.code(401).send({ error: "Missing Authorization Bearer token" });
      return;
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error !== null || data.user === undefined) {
      await reply.code(401).send({ error: "Invalid or expired session" });
      return;
    }
    req.authUserId = data.user.id;
  };
}

/**
 * Reads `X-Project-Id`, confirms the project exists, and sets `req.activeProjectId`.
 * All signed-in users may access any project (org-wide; no per-account ACL).
 */
export function createRequireProjectAccessPreHandler(prisma: PrismaClient): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = req.authUserId;
    if (userId === undefined || userId.length === 0) {
      await reply.code(500).send({ error: "Auth context missing" });
      return;
    }
    const raw = req.headers["x-project-id"];
    const projectId = typeof raw === "string" ? raw.trim() : "";
    if (projectId.length === 0) {
      await reply.code(400).send({ error: "Missing X-Project-Id header" });
      return;
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (project === null) {
      await reply.code(404).send({ error: "Unknown project" });
      return;
    }
    req.activeProjectId = projectId;
  };
}
