/**
 * WhatsApp-style phone-frame message preview.
 * Shows a live render of the post/poll as it will appear in the group.
 */

import type { ReactElement } from "react";
import type { MessageKind } from "../types/models.js";

type MessagePreviewProps = {
  kind: MessageKind;
  /** Display title (may include JID hint when several groups share the same name). */
  groupTitle: string;
  copyText: string;
  pollQuestion: string;
  pollOptions: string[];
  pollMultiSelect: boolean;
  /** Blob or authenticated object URL to show the image; omit when no image. */
  imageSrc: string | null;
  scheduledLocal: string;
};

export function MessagePreview({
  kind,
  groupTitle,
  copyText,
  pollQuestion,
  pollOptions,
  pollMultiSelect,
  imageSrc,
  scheduledLocal,
}: MessagePreviewProps): ReactElement {
  const timeLabel =
    scheduledLocal.length > 0
      ? scheduledLocal.replace("T", " ").slice(0, 16)
      : null;

  const hasImage = imageSrc !== null && imageSrc.length > 0;
  const isEmpty =
    kind === "POST"
      ? copyText.trim().length === 0 && !hasImage
      : pollQuestion.trim().length === 0;

  return (
    <div className="preview-frame-wrap">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Preview
      </p>
      {/* Phone shell */}
      <div className="preview-phone">
        {/* WA-style header bar */}
        <div className="preview-phone__header">
          <div className="preview-phone__avatar" aria-hidden="true">
            {groupTitle.length > 0 ? groupTitle[0]?.toUpperCase() : "#"}
          </div>
          <div className="preview-phone__header-text">
            <p className="preview-phone__group" title={groupTitle}>
              {groupTitle.length > 0 ? groupTitle : "Group name"}
            </p>
            <p className="preview-phone__member-count">tap here for group info</p>
          </div>
        </div>

        {/* Chat area */}
        <div className="preview-phone__chat">
          {isEmpty ? (
            <p className="preview-empty">Your message will appear here.</p>
          ) : null}

          {!isEmpty && kind === "POST" ? (
            <div className="preview-bubble">
              {hasImage ? (
                <img
                  src={imageSrc}
                  alt=""
                  className="preview-bubble__img"
                />
              ) : null}
              {copyText.trim().length > 0 ? (
                <p className="preview-bubble__text">{copyText}</p>
              ) : null}
              <span className="preview-bubble__time">{timeLabel ?? "—"}</span>
            </div>
          ) : null}

          {!isEmpty && kind === "POLL" ? (
            <div className="preview-poll">
              <div className="preview-poll__header">
                <span className="preview-poll__icon" aria-hidden="true">📊</span>
                <p className="preview-poll__question">
                  {pollQuestion.trim().length > 0 ? pollQuestion : "Poll question"}
                </p>
              </div>
              <ul className="preview-poll__options">
                {pollOptions
                  .filter((o) => o.trim().length > 0)
                  .slice(0, 12)
                  .map((o, i) => (
                    <li key={`prev-opt-${String(i)}`} className="preview-poll__option">
                      <span className="preview-poll__option-dot" aria-hidden="true" />
                      {o}
                    </li>
                  ))}
                {pollOptions.filter((o) => o.trim().length > 0).length === 0 ? (
                  <li className="preview-poll__option preview-poll__option--placeholder">
                    Option 1, Option 2…
                  </li>
                ) : null}
              </ul>
              {pollMultiSelect ? (
                <p className="preview-poll__multi">Multiple answers allowed</p>
              ) : null}
              <span className="preview-bubble__time preview-poll__time">{timeLabel ?? "—"}</span>
            </div>
          ) : null}
        </div>

        {/* WA-style input stub */}
        <div className="preview-phone__input-bar" aria-hidden="true">
          <span>Message</span>
        </div>
      </div>
    </div>
  );
}
