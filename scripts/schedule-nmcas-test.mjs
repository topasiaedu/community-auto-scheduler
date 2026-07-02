/**
 * List NMCAS groups and schedule a near-future test post.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });

const API = "http://127.0.0.1:3001";
const PROJECT = "nmcas-default-project";
const EMAIL = process.env.NMCAS_TEST_EMAIL;
const PASSWORD = process.env.NMCAS_TEST_PASSWORD;
if (EMAIL === undefined || PASSWORD === undefined) {
  throw new Error("Set NMCAS_TEST_EMAIL and NMCAS_TEST_PASSWORD in .env");
}

async function signIn() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl === undefined || anonKey === undefined) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY required");
  }
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok || body.access_token === undefined) {
    throw new Error(body.error_description ?? "auth failed");
  }
  return body.access_token;
}

const token = await signIn();
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-Project-Id": PROJECT,
};

const groupsRes = await fetch(`${API}/wa/groups`, { headers });
const groupsBody = await groupsRes.json();
const groups = groupsBody.groups ?? [];
console.log("Groups:");
for (const g of groups) {
  console.log(`  ${g.label ?? g.name} → ${g.jid}`);
}

const target =
  groups.find((g) => (g.name ?? g.label ?? "").toLowerCase() === "general") ??
  groups.find((g) => (g.label ?? g.name ?? "").toLowerCase().includes("nmcas test")) ??
  groups[0];

if (target === undefined) {
  throw new Error("No groups available");
}

const sendAt = new Date(Date.now() + 60 * 1000);
const customText = process.argv[2];
const text =
  customText !== undefined && customText.length > 0
    ? customText
    : `NMCAS test #2 — ${sendAt.toISOString()}. Reaction test from the linked account.`;

console.log(`\nScheduling test post to: ${target.label ?? target.name} (${target.jid})`);
console.log(`Send at (UTC): ${sendAt.toISOString()}`);

const msgRes = await fetch(`${API}/messages`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    type: "POST",
    groupJid: target.jid,
    groupName: target.name ?? target.label ?? "General",
    copyText: text,
    scheduledAt: sendAt.toISOString(),
  }),
});
const msgBody = await msgRes.json();
console.log("schedule:", msgRes.status, JSON.stringify(msgBody));
