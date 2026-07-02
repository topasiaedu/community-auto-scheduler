/**
 * Verifies local stack + NMCAS WhatsApp link state (reads credentials from env vars).
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });

const API = "http://127.0.0.1:3001";
const PROJECT = "nmcas-default-project";
const EMAIL = process.env.NMCAS_TEST_EMAIL;
const PASSWORD = process.env.NMCAS_TEST_PASSWORD;
if (EMAIL === undefined || PASSWORD === undefined) {
  throw new Error("Set NMCAS_TEST_EMAIL and NMCAS_TEST_PASSWORD in .env for local verify scripts");
}

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (supabaseUrl === undefined || anonKey === undefined) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY required");
}

const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anonKey },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const authBody = await authRes.json();
if (!authRes.ok || authBody.access_token === undefined) {
  throw new Error(authBody.error_description ?? `auth failed (${String(authRes.status)})`);
}
const token = authBody.access_token;

const authHeaders = { Authorization: `Bearer ${token}` };
const projectHeaders = { ...authHeaders, "X-Project-Id": PROJECT };

const health = await (await fetch(`${API}/health`)).json();
console.log("health:", JSON.stringify(health));

const projectsRes = await fetch(`${API}/projects`, { headers: authHeaders });
const projectsBody = await projectsRes.json();
const projectLines = (projectsBody.projects ?? []).map((p) => `${p.name} (${p.id})`);
console.log("projects:", projectLines.join(", "));

const statusRes = await fetch(`${API}/wa/status`, { headers: projectHeaders });
const status = await statusRes.json();
console.log("wa/status:", JSON.stringify(status));

const qrRes = await fetch(`${API}/wa/qr`, { headers: projectHeaders });
if (qrRes.status === 204) {
  console.log("wa/qr: not ready (204)");
} else {
  const qrBody = await qrRes.json();
  console.log("wa/qr:", qrBody.qr !== undefined ? `ready len=${String(qrBody.qr.length)}` : JSON.stringify(qrBody));
}

if (status.state === "connected") {
  console.log("Fetching groups (may take a minute on first load)…");
  const groupsRes = await fetch(`${API}/wa/groups?refresh=1`, { headers: projectHeaders });
  const groupsBody = await groupsRes.json();
  const names = (groupsBody.groups ?? []).slice(0, 15).map((g) => g.label ?? g.name ?? g.jid);
  console.log(`groups: count=${String((groupsBody.groups ?? []).length)} sample=${names.join(" | ")}`);
}
