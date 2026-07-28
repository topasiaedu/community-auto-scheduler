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
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required for Storage"),
  /**
   * Optional local SQLite directory for whatsmeow (`file:./data/wa-sessions`).
   * Sessions are also persisted to Postgres (`WhatsAppSessionBlob`) via `DATABASE_URL`
   * so Render survives deploys without direct Postgres / search_path.
   */
  WHATSAPP_STORE_URL: z.string().min(1).optional(),
  NMCAS_POST_MEDIA_BUCKET: z.string().min(1, "NMCAS_POST_MEDIA_BUCKET is required for post images"),
  /**
   * Always keep a WhatsApp session warm inside the API process.
   *
   * Defaults to `true` to avoid cold-boot flakiness and UI false "API not running" errors.
   * Kill-switch: set to `false`, `"0"`, or `"no"` to restore lazy boot + idle eviction.
   */
  WA_ALWAYS_ON: z.preprocess((raw) => {
    if (raw === undefined) {
      return undefined;
    }
    const asString = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (asString === "") {
      return undefined;
    }
    if (["false", "0", "no", "off"].includes(asString)) {
      return false;
    }
    if (["true", "1", "yes", "on"].includes(asString)) {
      return true;
    }
    // Any non-empty unrecognized value falls back to the default.
    return undefined;
  }, z.boolean().default(true)),
  /**
   * Safety cap on how many WhatsApp clients (projects) are allowed to stay warm.
   * When warm clients exceed this, LRU-shutdowns happen (never interrupt QR scans).
   */
  WA_MAX_WARM_CLIENTS: z.coerce.number().int().positive().default(4),
  /**
   * After IPC accept stores `waMessageId`, wait this many ms for `message:receipt`
   * before marking the row FAILED (never green SENT without a server receipt).
   * Default 90_000. Separate from the 120s IPC hang timeout in the send worker.
   */
  WA_RECEIPT_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
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
