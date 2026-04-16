/**
 * Supabase Auth JWT verification for Fastify (`Authorization: Bearer`) and optional
 * default-project bootstrap for first-time users.
 */

import { createClient } from "@supabase/supabase-js";
import { Prisma } from "@prisma/client";
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

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Ensures the user has at least one project membership by joining the seeded default project.
 */
async function ensureDefaultProjectMembership(
  prisma: PrismaClient,
  env: ApiEnv,
  userId: string,
): Promise<void> {
  const existing = await prisma.projectMember.findFirst({ where: { userId }, select: { id: true } });
  if (existing !== null) {
    return;
  }
  const projectId = env.DEFAULT_PROJECT_ID;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (project === null) {
    return;
  }
  try {
    await prisma.projectMember.create({
      data: { userId, projectId },
    });
  } catch (err: unknown) {
    if (!isUniqueConstraintViolation(err)) {
      throw err;
    }
  }
}

/**
 * Verifies the Supabase JWT and attaches `req.authUserId`. Optionally auto-joins the default project.
 */
export function createRequireAuthPreHandler(
  env: ApiEnv,
  prisma: PrismaClient,
): preHandlerHookHandler {
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
    if (env.AUTH_AUTO_JOIN_DEFAULT_PROJECT) {
      await ensureDefaultProjectMembership(prisma, env, data.user.id);
    }
  };
}

/**
 * Reads `X-Project-Id`, confirms `ProjectMember` row, and sets `req.activeProjectId`.
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
    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { id: true },
    });
    if (member === null) {
      await reply.code(403).send({ error: "Not a member of this project" });
      return;
    }
    req.activeProjectId = projectId;
  };
}
