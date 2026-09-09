/**
 * Ops WhatsApp DM recipients for FAILED-send alerts and the daily digest.
 *
 * `NMCAS_FAILURE_NOTIFY_MSISDN` may be one number or a comma/semicolon/whitespace
 * separated list. Defaults always include the current ops contacts so adding a
 * number in code still works when production env still has a single MSISDN.
 */

/** Digits-only MSISDNs that always receive ops DMs (failure alerts + daily digest). */
export const DEFAULT_NOTIFY_MSISDNS: readonly string[] = [
  "60139968817",
  "60176782206",
];

const MIN_MSISDN_DIGITS = 10;
const MAX_MSISDN_DIGITS = 15;

/**
 * Extracts unique, digits-only MSISDNs from a raw env string.
 * Invalid tokens (wrong length after stripping non-digits) are skipped.
 */
export function extractValidMsisdns(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [];
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const parts = trimmed.split(/[,;\s]+/u);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (part.length === 0) {
      continue;
    }
    const digits = part.replace(/\D/gu, "");
    if (digits.length < MIN_MSISDN_DIGITS || digits.length > MAX_MSISDN_DIGITS) {
      continue;
    }
    if (seen.has(digits)) {
      continue;
    }
    seen.add(digits);
    out.push(digits);
  }
  return out;
}

/**
 * Merges default ops numbers with any extra valid numbers from env.
 * Env cannot remove a default; it can only add more recipients.
 */
export function resolveNotifyMsisdns(raw: string | undefined): string[] {
  const fromEnv = extractValidMsisdns(raw);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const msisdn of [...DEFAULT_NOTIFY_MSISDNS, ...fromEnv]) {
    if (seen.has(msisdn)) {
      continue;
    }
    seen.add(msisdn);
    out.push(msisdn);
  }
  return out;
}

/**
 * Builds a 1:1 WhatsApp user JID from a digits-only MSISDN.
 */
export function toWhatsAppUserJid(msisdn: string): string {
  return `${msisdn}@s.whatsapp.net`;
}
