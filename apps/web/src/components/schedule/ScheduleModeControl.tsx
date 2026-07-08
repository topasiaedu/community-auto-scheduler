/**
 * Campaign | Single message mode switch for the Schedule page.
 */

import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import type { SchedulePageMode } from "../../lib/scheduleMode.js";

type ScheduleModeControlProps = {
  value: SchedulePageMode;
  onChange: (mode: SchedulePageMode) => void;
};

export function ScheduleModeControl({ value, onChange }: ScheduleModeControlProps): ReactElement {
  return (
    <div
      className="flex h-10 max-w-md overflow-hidden rounded-lg border border-border"
      role="group"
      aria-label="Schedule mode"
    >
      {(
        [
          { mode: "campaign" as const, label: "Campaign" },
          { mode: "single" as const, label: "Single message" },
        ] as const
      ).map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "flex-1 px-4 text-sm font-medium transition-colors min-h-[44px]",
            value === mode
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted",
          )}
          aria-pressed={value === mode}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
