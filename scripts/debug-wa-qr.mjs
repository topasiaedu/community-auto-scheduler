/**
 * Live WA QR probe — run with a browser session token (no .env required).
 *
 * Usage (PowerShell):
 *   $env:NMCAS_DEBUG_TOKEN = "<paste access_token from Application → Local Storage → sb-*-auth-token>"
 *   $env:NMCAS_DEBUG_PROJECT_ID = "<X-Project-Id from Network tab on any /wa/* request>"
 *   node scripts/debug-wa-qr.mjs
 *
 * Optional:
 *   $env:NMCAS_DEBUG_API = "https://nmcas-server.nmmedia.app"
 */

const apiBase = (process.env.NMCAS_DEBUG_API ?? "https://nmcas-server.nmmedia.app").replace(/\/$/, "");
const token = process.env.NMCAS_DEBUG_TOKEN?.trim() ?? "";
const projectId = process.env.NMCAS_DEBUG_PROJECT_ID?.trim() ?? "";

if (token.length === 0 || projectId.length === 0) {
  console.error("Set NMCAS_DEBUG_TOKEN and NMCAS_DEBUG_PROJECT_ID (see script header).");
  process.exit(1);
}

/**
 * @param {string} path
 */
async function hit(path) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Project-Id": projectId,
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { path, status: res.status, body };
}

const rounds = Number(process.env.NMCAS_DEBUG_ROUNDS ?? "5");
const delayMs = Number(process.env.NMCAS_DEBUG_DELAY_MS ?? "2000");

console.log(JSON.stringify({ apiBase, projectId, rounds, delayMs }, null, 2));

for (let i = 1; i <= rounds; i += 1) {
  const status = await hit("/wa/status");
  const qr = await hit("/wa/qr");
  const qrPreview =
    qr.body !== null &&
    typeof qr.body === "object" &&
    typeof qr.body.qr === "string"
      ? { qrLen: qr.body.qr.length, qrPrefix: qr.body.qr.slice(0, 24) }
      : qr.body;

  console.log(
    JSON.stringify(
      {
        round: i,
        status,
        qr: { status: qr.status, body: qrPreview },
      },
      null,
      2,
    ),
  );

  if (i < rounds) {
    await new Promise((r) => setTimeout(r, delayMs));
  }
}
