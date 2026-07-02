/**
 * Polls NMCAS WhatsApp until linked (no QR) and groups are loaded.
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
const headers = { Authorization: `Bearer ${token}`, "X-Project-Id": PROJECT };

console.log("Waiting for NMCAS WhatsApp link (scan QR on Connect page)…");

for (let attempt = 1; attempt <= 120; attempt += 1) {
  const status = await (await fetch(`${API}/wa/status`, { headers })).json();
  if (status.state === "connected" && status.hasQr !== true) {
    console.log("Linked! Loading groups…");
    const groupsRes = await fetch(`${API}/wa/groups?refresh=1`, { headers });
    const groupsBody = await groupsRes.json();
    const groups = groupsBody.groups ?? [];
    console.log(`groups: ${String(groups.length)} found`);
    for (const g of groups.slice(0, 20)) {
      console.log(`  - ${g.label ?? g.name ?? g.jid}`);
    }
    if (groups.length === 0) {
      console.log("No groups yet — account may need a moment or wrong WhatsApp number.");
      process.exitCode = 1;
    }
    process.exit(0);
  }
  if (attempt % 6 === 0) {
    console.log(`…still waiting (${String(attempt * 5)}s) state=${String(status.state)} hasQr=${String(status.hasQr)}`);
  }
  await new Promise((r) => setTimeout(r, 5000));
}

console.error("Timed out after 10 minutes — scan the QR on Connect (NMCAS project).");
process.exitCode = 1;
