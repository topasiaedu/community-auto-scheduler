import { z } from "zod";

/** Matches `packages/db/prisma/seed.ts` default project id. */
export const DEFAULT_PROJECT_ID_VALUE = "nmcas-default-project";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Comma-separated origins for CORS (e.g. `http://localhost:5173,http://localhost:5174`). */
  WEB_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  DEFAULT_PROJECT_ID: z.string().min(1).default(DEFAULT_PROJECT_ID_VALUE),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  /** Used with `auth.getUser(jwt)` to verify browser sessions (never use the service role for this). */
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required for JWT verification"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required for WA + Storage"),
  NMCAS_SESSION_BUCKET: z.string().min(1, "NMCAS_SESSION_BUCKET is required"),
  NMCAS_POST_MEDIA_BUCKET: z.string().min(1, "NMCAS_POST_MEDIA_BUCKET is required for post images"),
  /**
   * Digits-only MSISDN (e.g. `60139968817` or set `+60139968817` in env; non-digits stripped).
   * Worker sends one WhatsApp text here when a scheduled message becomes `FAILED`.
   */
  NMCAS_FAILURE_NOTIFY_MSISDN: z
    .string()
    .optional()
    .transform((raw) => {
      const fallback = "60139968817";
      if (raw === undefined || raw.trim().length === 0) {
        return fallback;
      }
      const digits = raw.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) {
        return fallback;
      }
      return digits;
    }),
});

export type ApiEnv = z.infer<typeof EnvSchema>;

/**
 * Parses and validates process environment for the API process.
 */
export function loadApiEnv(): ApiEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment: ${JSON.stringify(detail)}`);
  }
  return parsed.data;
}
