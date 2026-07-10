/**
 * Pure builders for P7 single-message schedule API payloads.
 */

import { mytLocalToUtcIso } from "../myt.js";
import { WHATSAPP_POST_TEXT_MAX_CHARS } from "./whatsappLimits.js";
import type { CampaignCustomValues, OperatorKind, ValueFormat } from "../types/models.js";

export type SingleMessageFields = {
  operatorKind: OperatorKind;
  valueFormat: ValueFormat;
  scheduledLocal: string;
  groupJid: string;
  groupName: string;
  fanOut?: boolean;
  copyText: string;
  imagePath: string | null;
  pollQuestion: string;
  pollOptions: string[];
  pollMultiSelect: boolean;
  reminderTemplateId: string;
  customValues: CampaignCustomValues;
};

export type BuildResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

function parseScheduledAt(scheduledLocal: string): BuildResult & { scheduledAt?: string } {
  try {
    const scheduledAt = mytLocalToUtcIso(scheduledLocal);
    return { ok: true, body: {}, scheduledAt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid time" };
  }
}

export function buildSingleMessageBody(fields: SingleMessageFields): BuildResult {
  const timeResult = parseScheduledAt(fields.scheduledLocal);
  if (!timeResult.ok || timeResult.scheduledAt === undefined) {
    return { ok: false, error: timeResult.ok ? "Invalid time" : timeResult.error };
  }
  const scheduledAt = timeResult.scheduledAt;

  if (fields.operatorKind === "REMINDER") {
    if (fields.reminderTemplateId.length === 0) {
      return { ok: false, error: "Pick a reminder template slot." };
    }
    return {
      ok: true,
      body: {
        operatorKind: "REMINDER",
        reminderTemplateId: fields.reminderTemplateId,
        customValues: fields.customValues,
        groupJid: fields.groupJid,
        groupName: fields.groupName,
        scheduledAt,
      },
    };
  }

  if (fields.valueFormat === "IMAGE_CAPTION") {
    if (fields.imagePath === null || fields.imagePath.length === 0) {
      return { ok: false, error: "Upload an image for this Value post." };
    }
    if (fields.copyText.trim().length === 0) {
      return { ok: false, error: "Enter a caption for the image." };
    }
    if (fields.copyText.length > WHATSAPP_POST_TEXT_MAX_CHARS) {
      return {
        ok: false,
        error: `Caption must be at most ${String(WHATSAPP_POST_TEXT_MAX_CHARS)} characters.`,
      };
    }
    if (fields.fanOut === true) {
      return {
        ok: true,
        body: {
          operatorKind: "VALUE",
          valueFormat: "IMAGE_CAPTION",
          fanOut: true,
          copyText: fields.copyText.trim(),
          imageUrl: fields.imagePath,
          scheduledAt,
        },
      };
    }
    return {
      ok: true,
      body: {
        operatorKind: "VALUE",
        valueFormat: "IMAGE_CAPTION",
        groupJid: fields.groupJid,
        groupName: fields.groupName,
        copyText: fields.copyText.trim(),
        imageUrl: fields.imagePath,
        scheduledAt,
      },
    };
  }

  if (fields.valueFormat === "TEXT_ONLY") {
    if (fields.copyText.trim().length === 0) {
      return { ok: false, error: "Enter message text." };
    }
    if (fields.copyText.length > WHATSAPP_POST_TEXT_MAX_CHARS) {
      return {
        ok: false,
        error: `Message must be at most ${String(WHATSAPP_POST_TEXT_MAX_CHARS)} characters.`,
      };
    }
    if (fields.fanOut === true) {
      return {
        ok: true,
        body: {
          operatorKind: "VALUE",
          valueFormat: "TEXT_ONLY",
          fanOut: true,
          copyText: fields.copyText.trim(),
          scheduledAt,
        },
      };
    }
    return {
      ok: true,
      body: {
        operatorKind: "VALUE",
        valueFormat: "TEXT_ONLY",
        groupJid: fields.groupJid,
        groupName: fields.groupName,
        copyText: fields.copyText.trim(),
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
  if (fields.fanOut === true) {
    return {
      ok: true,
      body: {
        operatorKind: "VALUE",
        valueFormat: "POLL",
        fanOut: true,
        pollQuestion: trimmedQ,
        pollOptions: trimmedOpts,
        pollMultiSelect: fields.pollMultiSelect,
        scheduledAt,
      },
    };
  }
  return {
    ok: true,
    body: {
      operatorKind: "VALUE",
      valueFormat: "POLL",
      groupJid: fields.groupJid,
      groupName: fields.groupName,
      pollQuestion: trimmedQ,
      pollOptions: trimmedOpts,
      pollMultiSelect: fields.pollMultiSelect,
      scheduledAt,
    },
  };
}

export function singleMessagePreviewBody(fields: SingleMessageFields): string {
  if (fields.operatorKind === "REMINDER") {
    return fields.copyText.trim().slice(0, 120);
  }
  if (fields.valueFormat === "POLL") {
    return fields.pollQuestion.trim().slice(0, 120);
  }
  return fields.copyText.trim().slice(0, 120);
}

export function singleMessageFormatLabel(fields: SingleMessageFields): string {
  if (fields.operatorKind === "REMINDER") {
    return "Reminder";
  }
  if (fields.valueFormat === "IMAGE_CAPTION") {
    return "Image";
  }
  if (fields.valueFormat === "TEXT_ONLY") {
    return "Text";
  }
  return "Poll";
}
