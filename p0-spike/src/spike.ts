/**
 * P0 spike entrypoint: connect to WhatsApp with Baileys while persisting auth state in Supabase Storage.
 *
 * Flow:
 * 1. Validate environment variables.
 * 2. Build Supabase-backed auth state for `NMCAS_PROJECT_ID`.
 * 3. Open a Baileys socket; print QR in the terminal until linked.
 * 4. On success, optionally send one test message to `NMCAS_TEST_GROUP_JID`.
 *
 * Re-run the script after a successful login to confirm credentials reload from Storage without scanning again.
 */

import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Load repo root `.env` so the spike shares config with the monorepo (not `p0-spike/.env`). */
const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../.env") });
import { createClient } from "@supabase/supabase-js";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type ConnectionState,
} from "@whiskeysockets/baileys";
import { isBoom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { loadSpikeEnv } from "./env.js";
import { useSupabaseMultiFileAuthState } from "./supabase-multi-file-auth-state.js";

const logger = pino({ level: "warn" });

/**
 * Derives WhatsApp disconnect HTTP status when Baileys provides a Boom error.
 */
function readDisconnectStatusCode(lastDisconnect: ConnectionState["lastDisconnect"]): number | undefined {
  const err = lastDisconnect?.error;
  if (err === undefined) {
    return undefined;
  }
  if (isBoom(err)) {
    return err.output.statusCode;
  }
  return undefined;
}

/**
 * Opens one Baileys connection using Storage-backed auth; reconnects unless the user logged out from the phone.
 */
async function connectToWhatsApp(): Promise<void> {
  const env = loadSpikeEnv();
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useSupabaseMultiFileAuthState(
    supabase,
    env.sessionBucket,
    env.projectId,
  );

  const sock = makeWASocket({
    auth: state,
    version,
    logger,
    printQRInTerminal: false,
    browser: ["NMCAS", "P0-Spike", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (typeof qr === "string" && qr.length > 0) {
      console.log("Scan this QR with WhatsApp → Linked devices → Link a device");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = readDisconnectStatusCode(lastDisconnect);
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `Connection closed (status ${String(statusCode)}). Reconnect: ${String(shouldReconnect)}`,
      );
      if (shouldReconnect) {
        void connectToWhatsApp();
      } else {
        console.log(
          "Session was logged out from the phone. Delete Storage objects under this project prefix if you want a fresh QR.",
        );
      }
    } else if (connection === "open") {
      console.log(`Connected. Session files are in Supabase Storage under sessions/${env.projectId}/`);
      if (env.testGroupJid !== undefined) {
        const testJid = env.testGroupJid;
        void (async () => {
          try {
            await sock.sendMessage(testJid, {
              text: "NMCAS P0: Storage-backed Baileys session is online.",
            });
            console.log(`Sent test message to ${testJid}`);
          } catch (err) {
            console.error("Failed to send test message:", err);
          }
        })();
      }
    }
  });
}

void connectToWhatsApp().catch((err) => {
  console.error("Fatal error starting spike:", err);
  process.exitCode = 1;
});
