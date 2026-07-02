import { randomBytes } from "node:crypto";

/**
 * 32-byte `MessageContextInfo.messageSecret` for community-group reaction support.
 * Included on every outbound group message (harmless on regular groups).
 */
export function createMessageSecretBase64(): string {
  return randomBytes(32).toString("base64");
}

/**
 * `messageContextInfo` for `sendRawMessage`. The Go IPC layer expects protobuf JSON:
 * `bytes` fields must be base64 strings, not JSON number arrays.
 */
export function createMessageContextInfo(): { messageSecret: string } {
  return { messageSecret: createMessageSecretBase64() };
}