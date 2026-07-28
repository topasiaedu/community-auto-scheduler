import { PrismaClient } from "@prisma/client";

const DEFAULT_PRISMA_CONNECTION_LIMIT = 5;

function resolvePrismaConnectionLimit(): number {
  const raw = process.env.PRISMA_CONNECTION_LIMIT;
  if (raw === undefined) {
    return DEFAULT_PRISMA_CONNECTION_LIMIT;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return DEFAULT_PRISMA_CONNECTION_LIMIT;
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) {
    return DEFAULT_PRISMA_CONNECTION_LIMIT;
  }
  return n;
}

/**
 * Creates a new Prisma client. Prefer a single shared instance per Node process (e.g. attach to Fastify `decorate`).
 *
 * `connection_limit=5` (default): Prisma's default opens up to 10 connections on startup. On Supabase free tier the
 * session-pooler `pool_size` is typically 10–15, and pg-boss already claims 3 slots, so 10+3 connections at
 * boot instantly triggers `MaxClientsInSessionMode`. Five connections are enough for a low-traffic API.
 */
export function createPrismaClient(): PrismaClient {
  const connectionLimit = resolvePrismaConnectionLimit();
  return new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL !== undefined
      ? appendUrlParam(process.env.DATABASE_URL, "connection_limit", String(connectionLimit))
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
export type { CampaignCustomValues } from "./campaignTypes.js";
export type {
  Campaign,
  MessageReaction,
  MessageReply,
  MessageStatus,
  MessageType,
  OperatorKind,
  Project,
  ReminderFormat,
  ReminderTemplate,
  ScheduleRuleKind,
  ScheduledMessage,
  ValueFormat,
} from "@prisma/client";
export {
  REMINDER_TEMPLATE_SLOT_DEFINITIONS,
  seedReminderTemplatesForProject,
  type ReminderTemplateSlotDefinition,
} from "./reminderTemplateDefaults.js";
export { hasUnresolvedPlaceholders, mergeTemplate } from "./mergeTemplate.js";
