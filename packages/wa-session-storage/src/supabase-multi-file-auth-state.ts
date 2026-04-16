/**
 * Supabase Storage–backed Baileys auth state.
 *
 * Mirrors the behaviour of Baileys `useMultiFileAuthState`, but each logical file is stored as one Storage object
 * under `sessions/{projectId}/…`, matching the NMCAS wiki convention.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { Mutex } from "async-mutex";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";

/** Per-object-path mutex map, same concurrency pattern as Baileys filesystem adapter. */
const fileLocks = new Map<string, Mutex>();

function getFileLock(objectPath: string): Mutex {
  const existing = fileLocks.get(objectPath);
  if (existing !== undefined) {
    return existing;
  }
  const mutex = new Mutex();
  fileLocks.set(objectPath, mutex);
  return mutex;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/**
 * Heuristic for Supabase-js / Node fetch errors that often clear on retry (VPN blips, DNS, idle sockets).
 */
function isLikelyTransientStorageFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("enotfound") ||
    lower.includes("socket hang up") ||
    lower.includes("timeout")
  );
}

/**
 * Sanitises logical filenames so they are safe as a single Storage object name segment.
 */
function fixFileName(file: string): string {
  return file.replace(/\//g, "__").replace(/:/g, "-");
}

/**
 * Returns the Storage prefix for Baileys session objects for a project (trailing slash).
 */
export function getSessionStoragePrefix(projectId: string): string {
  return `sessions/${projectId}/`;
}

function objectPathFor(projectId: string, logicalFile: string): string {
  return `${getSessionStoragePrefix(projectId)}${fixFileName(logicalFile)}`;
}

/**
 * Parses JSON produced by Baileys using `BufferJSON` reviver so Buffers deserialize correctly.
 */
function parseStoredAuthJson(raw: string): unknown {
  return JSON.parse(raw, BufferJSON.reviver);
}

/**
 * Normalises a stored `app-state-sync-key` payload into the protobuf shape Baileys expects.
 */
function normaliseKeyValue<T extends keyof SignalDataTypeMap>(
  type: T,
  value: unknown,
): unknown {
  if (type === "app-state-sync-key" && value !== null && typeof value === "object") {
    return proto.Message.AppStateSyncKeyData.fromObject(
      value as proto.Message.IAppStateSyncKeyData,
    );
  }
  return value;
}

/**
 * Best-effort validation that parsed JSON is a Baileys credential blob we previously wrote.
 */
function isPersistedAuthCreds(value: unknown): value is AuthenticationState["creds"] {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.registered === "boolean" &&
    rec.noiseKey !== undefined &&
    rec.signedIdentityKey !== undefined
  );
}

export type SupabaseMultiFileAuthStateResult = {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
};

/**
 * Builds a Baileys-compatible `AuthenticationState` backed by Supabase Storage.
 *
 * @param supabase Client configured with credentials allowed to read/write the session bucket.
 * @param bucket Private bucket name that already exists in the Supabase project.
 * @param projectId NMCAS project identifier; scopes all objects under `sessions/{projectId}/`.
 */
export async function useSupabaseMultiFileAuthState(
  supabase: SupabaseClient,
  bucket: string,
  projectId: string,
): Promise<SupabaseMultiFileAuthStateResult> {
  const writeData = async (data: unknown, logicalFile: string): Promise<void> => {
    const objectPath = objectPathFor(projectId, logicalFile);
    const mutex = getFileLock(objectPath);
    const release = await mutex.acquire();
    try {
      const payload = JSON.stringify(data, BufferJSON.replacer);
      const body = Buffer.from(payload, "utf-8");
      const maxAttempts = 4;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const { error } = await supabase.storage.from(bucket).upload(objectPath, body, {
          upsert: true,
          contentType: "application/json; charset=utf-8",
        });
        if (error === null) {
          return;
        }
        const retryable =
          isLikelyTransientStorageFailure(error.message) && attempt < maxAttempts;
        if (!retryable) {
          throw new Error(`Storage upload failed for ${objectPath}: ${error.message}`);
        }
        await sleep(300 * attempt);
      }
    } finally {
      release();
    }
  };

  const readData = async (logicalFile: string): Promise<unknown | null> => {
    const objectPath = objectPathFor(projectId, logicalFile);
    const mutex = getFileLock(objectPath);
    const release = await mutex.acquire();
    try {
      const { data, error } = await supabase.storage.from(bucket).download(objectPath);
      if (error !== null || data === null) {
        return null;
      }
      const text = await data.text();
      return parseStoredAuthJson(text);
    } catch {
      return null;
    } finally {
      release();
    }
  };

  const removeData = async (logicalFile: string): Promise<void> => {
    const objectPath = objectPathFor(projectId, logicalFile);
    const mutex = getFileLock(objectPath);
    const release = await mutex.acquire();
    try {
      const { error } = await supabase.storage.from(bucket).remove([objectPath]);
      if (error !== null) {
        if (!error.message.toLowerCase().includes("not found")) {
          console.warn(`Storage remove warning for ${objectPath}: ${error.message}`);
        }
      }
    } finally {
      release();
    }
  };

  const rawCreds = await readData("creds.json");
  const creds = isPersistedAuthCreds(rawCreds) ? rawCreds : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              const logicalFile = `${type}-${id}.json`;
              let value: unknown = await readData(logicalFile);
              value = normaliseKeyValue(type, value);
              data[id] = value as SignalDataTypeMap[T];
            }),
          );
          return data;
        },
        set: async (incoming: SignalDataSet) => {
          /**
           * Parallel writes within a type batch. Safety is guaranteed by the per-file Mutex in
           * `writeData`/`removeData` — the same pattern Baileys uses in `useMultiFileAuthState`.
           * Baileys' `addTransactionCapability` already serialises calls per key-type via a
           * PQueue, so we never receive concurrent calls for the same type. Using Promise.all
           * here is critical: sequential writes during QR pairing (110+ pre-keys × ~200ms) would
           * take 20+ seconds, causing the WS to time out with 428 before the 515 restart fires.
           */
          const tasks: Promise<void>[] = [];
          for (const category of Object.keys(incoming) as (keyof SignalDataSet)[]) {
            const categoryData = incoming[category];
            if (categoryData === undefined) {
              continue;
            }
            for (const id of Object.keys(categoryData)) {
              const value = categoryData[id];
              const logicalFile = `${String(category)}-${id}.json`;
              tasks.push(
                value !== null && value !== undefined
                  ? writeData(value, logicalFile)
                  : removeData(logicalFile),
              );
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData(creds, "creds.json");
    },
  };
}
