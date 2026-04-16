/**
 * Loads and validates environment variables required for the P0 spike.
 * Throws a descriptive error when a required value is missing or malformed.
 */

const REQUIRED_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NMCAS_SESSION_BUCKET",
  "NMCAS_PROJECT_ID",
] as const;

export type SpikeEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  sessionBucket: string;
  projectId: string;
  testGroupJid: string | undefined;
};

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Reads `process.env`, validates required keys, and returns a typed config object.
 */
export function loadSpikeEnv(): SpikeEnv {
  const missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (!isNonEmptyString(process.env[key])) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing or empty required environment variables: ${missing.join(", ")}. Copy .env.example to .env and fill values.`,
    );
  }

  const readRequired = (key: (typeof REQUIRED_KEYS)[number]): string => {
    const raw = process.env[key];
    if (!isNonEmptyString(raw)) {
      throw new Error(`Invariant: required env ${key} was validated but is now empty.`);
    }
    return raw.trim();
  };

  const supabaseUrl = readRequired("SUPABASE_URL");
  const supabaseServiceRoleKey = readRequired("SUPABASE_SERVICE_ROLE_KEY");
  const sessionBucket = readRequired("NMCAS_SESSION_BUCKET");
  const projectId = readRequired("NMCAS_PROJECT_ID");

  if (!supabaseUrl.startsWith("https://")) {
    throw new Error("SUPABASE_URL must be an https URL.");
  }

  let testGroupJid: string | undefined;
  if (isNonEmptyString(process.env.NMCAS_TEST_GROUP_JID)) {
    const jid = process.env.NMCAS_TEST_GROUP_JID.trim();
    if (!jid.endsWith("@g.us")) {
      throw new Error("NMCAS_TEST_GROUP_JID must be a WhatsApp group JID ending with @g.us");
    }
    testGroupJid = jid;
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    sessionBucket,
    projectId,
    testGroupJid,
  };
}
