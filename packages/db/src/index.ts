import { PrismaClient } from "@prisma/client";

/**
 * Creates a new Prisma client. Prefer a single shared instance per Node process (e.g. attach to Fastify `decorate`).
 *
 * `connection_limit=2`: Prisma's default opens up to 10 connections on startup.  On Supabase free tier the
 * session-pooler `pool_size` is typically 10–15, and pg-boss already claims 3 slots, so 10+3 connections at
 * boot instantly triggers `MaxClientsInSessionMode`.  Two connections are enough for a low-traffic API.
 */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL !== undefined
      ? appendUrlParam(process.env.DATABASE_URL, "connection_limit", "2")
      : undefined,
  });
}

/**
 * Appends `key=value` to a postgres connection URL query string without clobbering existing params.
 * Needed because we cannot assume the DATABASE_URL already has a `?` or the param we want.
 */
function appendUrlParam(url: string, key: string, value: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has(key)) {
      u.searchParams.set(key, value);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export { PrismaClient } from "@prisma/client";
export type { MessageStatus, MessageType, Project, ScheduledMessage } from "@prisma/client";
