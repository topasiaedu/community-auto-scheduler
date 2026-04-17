/**
 * Two-option segmented control replacing radio inputs for Post / Poll selection.
 */

import type { ReactElement } from "react";
import type { MessageKind } from "../types/models.js";

type SegmentedControlProps = {
  value: MessageKind;
  onChange: (value: MessageKind) => void;
  disabled?: boolean;
};

export function SegmentedControl({ value, onChange, disabled = false }: SegmentedControlProps): ReactElement {
  return (
    <div className="segmented-control" role="group" aria-label="Message type">
      <button
        type="button"
        className={`segmented-control__btn${value === "POST" ? " segmented-control__btn--active" : ""}`}
        disabled={disabled}
        aria-pressed={value === "POST"}
        onClick={() => onChange("POST")}
      >
        Post
      </button>
      <button
        type="button"
        className={`segmented-control__btn${value === "POLL" ? " segmented-control__btn--active" : ""}`}
        disabled={disabled}
        aria-pressed={value === "POLL"}
        onClick={() => onChange("POLL")}
      >
        Poll
      </button>
    </div>
  );
}
