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

/**
 * Sanitises logical filenames so they are safe as a single Storage object name segment.
 */
function fixFileName(file: string): string {
  return file.replace(/\//g, "__").replace(/:/g, "-");
}

function sessionPrefix(projectId: string): string {
  return `sessions/${projectId}/`;
}

function objectPathFor(projectId: string, logicalFile: string): string {
  return `${sessionPrefix(projectId)}${fixFileName(logicalFile)}`;
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
 * @param supabase Client configured with the service role key for local spike use.
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
      const { error } = await supabase.storage.from(bucket).upload(
        objectPath,
        Buffer.from(payload, "utf-8"),
        {
          upsert: true,
          contentType: "application/json; charset=utf-8",
        },
      );
      if (error !== null) {
        throw new Error(`Storage upload failed for ${objectPath}: ${error.message}`);
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
        // Missing object is acceptable on delete; other errors are logged-only for parity with Baileys fs adapter.
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
