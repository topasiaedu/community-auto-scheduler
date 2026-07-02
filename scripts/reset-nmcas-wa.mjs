/**
 * Reset NMCAS WhatsApp session and print link status.
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
  throw new Error(authBody.error_description ?? "auth failed");
}
const token = authBody.access_token;
const headers = { Authorization: `Bearer ${token}`, "X-Project-Id": PROJECT };

console.log("Resetting session…");
const resetRes = await fetch(`${API}/wa/session/reset`, { method: "POST", headers });
const resetBody = await resetRes.json();
console.log("reset:", resetRes.status, JSON.stringify(resetBody));

await new Promise((r) => setTimeout(r, 4000));

const status = await (await fetch(`${API}/wa/status`, { headers })).json();
console.log("status:", JSON.stringify(status));

const qrRes = await fetch(`${API}/wa/qr`, { headers });
if (qrRes.status === 204) {
  console.log("qr: waiting…");
} else {
  const qrBody = await qrRes.json();
  console.log("qr:", qrBody.qr !== undefined ? `ready len=${String(qrBody.qr.length)}` : JSON.stringify(qrBody));
}
