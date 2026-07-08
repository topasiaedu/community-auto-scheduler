/**
 * Compact inline preview for a queue row (P7 UX spec §7).
 */

import { useEffect, useState, type ReactElement } from "react";
import { cn } from "@/lib/utils";
import { excerptText } from "../lib/queueLabels.js";
import type { ScheduledMessage } from "../types/models.js";

type QueueMessagePreviewProps = {
  message: ScheduledMessage;
  fetchMediaUrl: (path: string) => Promise<string | null>;
};

export function QueueMessagePreview({
  message: m,
  fetchMediaUrl,
}: QueueMessagePreviewProps): ReactElement | null {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  const mediaPath =
    m.reminderFormat === "STICKER" && m.stickerUrl !== null && m.stickerUrl !== undefined
      ? m.stickerUrl
      : m.imageUrl;

  const isSticker =
    m.reminderFormat === "STICKER" ||
    (m.operatorKind === "REMINDER" && mediaPath !== null && m.imageUrl === null);

  useEffect(() => {
    if (mediaPath === null || mediaPath.length === 0) {
      setThumbUrl((prev) => {
        if (prev !== null) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      return;
    }

    let cancelled = false;
    void fetchMediaUrl(mediaPath).then((url) => {
      if (!cancelled) {
        setThumbUrl(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mediaPath, fetchMediaUrl]);

  useEffect(() => {
    return () => {
      if (thumbUrl !== null) {
        URL.revokeObjectURL(thumbUrl);
      }
    };
  }, [thumbUrl]);

  if (m.type === "POLL" || m.valueFormat === "POLL") {
    const question = m.pollQuestion ?? "";
    if (question.length === 0) {
      return null;
    }
    const optionCount = (m.pollOptions ?? []).filter((o) => o.trim().length > 0).length;
    return (
      <div className="mt-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground/80 line-clamp-2">{excerptText(question, 80)}</p>
        <p className="mt-0.5">{optionCount} option{optionCount === 1 ? "" : "s"}</p>
      </div>
    );
  }

  if (isSticker) {
    return (
      <div className="mt-2 flex items-start gap-2">
        <div
          className={cn(
            "sticker-preview-bg flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md",
          )}
        >
          {thumbUrl !== null ? (
            <img src={thumbUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-muted-foreground">Sticker</span>
          )}
        </div>
      </div>
    );
  }

  if (mediaPath !== null && mediaPath.length > 0) {
    const caption = m.copyText ?? "";
    return (
      <div className="mt-2 flex items-start gap-2">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {thumbUrl !== null ? (
            <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
              …
            </div>
          )}
        </div>
        {caption.length > 0 ? (
          <p className="min-w-0 flex-1 text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
            {excerptText(caption)}
          </p>
        ) : null}
      </div>
    );
  }

  const body = m.copyText ?? "";
  if (body.length > 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
        {excerptText(body)}
      </p>
    );
  }

  return null;
}
