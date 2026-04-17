/**
 * Pure builders for schedule API payloads (validation errors returned, no React coupling).
 */

import { mytLocalToUtcIso } from "../myt.js";
import { WHATSAPP_POST_TEXT_MAX_CHARS } from "./whatsappLimits.js";
import type { MessageKind } from "../types/models.js";

export type ScheduleFormFields = {
  messageKind: MessageKind;
  scheduledLocal: string;
  groupJid: string;
  groupName: string;
  copyText: string;
  imagePath: string | null;
  pollQuestion: string;
  pollOptions: string[];
  pollMultiSelect: boolean;
};

export type BuildResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

export function buildNewScheduleBody(fields: ScheduleFormFields): BuildResult {
  let scheduledAt: string;
  try {
    scheduledAt = mytLocalToUtcIso(fields.scheduledLocal);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid time" };
  }
  if (fields.messageKind === "POST") {
    if (fields.copyText.trim().length === 0 && (fields.imagePath === null || fields.imagePath.length === 0)) {
      return { ok: false, error: "Enter message text and/or upload an image." };
    }
    if (fields.copyText.length > WHATSAPP_POST_TEXT_MAX_CHARS) {
      return {
        ok: false,
        error: `Message text must be at most ${String(WHATSAPP_POST_TEXT_MAX_CHARS)} characters for WhatsApp.`,
      };
    }
    return {
      ok: true,
      body: {
        type: "POST",
        groupJid: fields.groupJid,
        groupName: fields.groupName,
        copyText: fields.copyText.trim().length > 0 ? fields.copyText.trim() : undefined,
        imageUrl: fields.imagePath ?? undefined,
        scheduledAt,
      },
    };
  }
  const trimmedQ = fields.pollQuestion.trim();
  const trimmedOpts = fields.pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
  if (trimmedQ.length === 0) {
    return { ok: false, error: "Enter a poll question." };
  }
  if (trimmedOpts.length < 2) {
    return { ok: false, error: "Add at least two non-empty poll options (up to 12)." };
  }
  if (trimmedOpts.length > 12) {
    return { ok: false, error: "WhatsApp allows at most 12 poll options." };
  }
  return {
    ok: true,
    body: {
      type: "POLL",
      groupJid: fields.groupJid,
      groupName: fields.groupName,
      pollQuestion: trimmedQ,
      pollOptions: trimmedOpts,
      pollMultiSelect: fields.pollMultiSelect,
      scheduledAt,
    },
  };
}

export function buildPatchDraftBody(fields: ScheduleFormFields, publish: boolean): BuildResult {
  let scheduledAt: string;
  try {
    scheduledAt = mytLocalToUtcIso(fields.scheduledLocal);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid time" };
  }
  if (fields.messageKind === "POST") {
    if (fields.copyText.length > WHATSAPP_POST_TEXT_MAX_CHARS) {
      return {
        ok: false,
        error: `Message text must be at most ${String(WHATSAPP_POST_TEXT_MAX_CHARS)} characters for WhatsApp.`,
      };
    }
    return {
      ok: true,
      body: {
        type: "POST",
        groupJid: fields.groupJid,
        groupName: fields.groupName,
        scheduledAt,
        publish,
        copyText: fields.copyText.trim().length > 0 ? fields.copyText.trim() : undefined,
        imageUrl: fields.imagePath ?? undefined,
      },
    };
  }
  return {
    ok: true,
    body: {
      type: "POLL",
      groupJid: fields.groupJid,
      groupName: fields.groupName,
      scheduledAt,
      publish,
      pollQuestion: fields.pollQuestion.trim(),
      pollOptions: fields.pollOptions,
      pollMultiSelect: fields.pollMultiSelect,
    },
  };
}
