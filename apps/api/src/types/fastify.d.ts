import "fastify";

/**
 * Request fields set by auth / project scoping hooks on protected routes.
 */
declare module "fastify" {
  interface FastifyRequest {
    /** Supabase Auth user id after `Authorization: Bearer` verification. */
    authUserId?: string;
    /** Project id from `X-Project-Id` after membership check. */
    activeProjectId?: string;
  }
}
