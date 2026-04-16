import { PrismaClient } from "@prisma/client";

/**
 * Creates a new Prisma client. Prefer a single shared instance per Node process (e.g. attach to Fastify `decorate`).
 */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

export { PrismaClient } from "@prisma/client";
export type { MessageStatus, MessageType, Project, ScheduledMessage } from "@prisma/client";
