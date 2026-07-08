/**
 * Horizontal status tabs plus queue kind filter chips (P7 UX spec §7).
 */

import type { ReactElement } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QueueKindFilter } from "../lib/queueLabels.js";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Scheduled", value: "PENDING" },
  { label: "Drafts", value: "DRAFT" },
  { label: "Sent", value: "SENT" },
  { label: "Failed", value: "FAILED" },
] as const;

const KIND_CHIPS: { label: string; value: QueueKindFilter }[] = [
  { label: "All", value: "all" },
  { label: "Campaign", value: "campaign" },
  { label: "Other", value: "other" },
  { label: "Reminder", value: "reminder" },
  { label: "Value", value: "value" },
];

type StatusTabFilterProps = {
  vm: NmcasViewModel;
  kindFilter: QueueKindFilter;
  onKindFilterChange: (value: QueueKindFilter) => void;
};

export function StatusTabFilter({
  vm,
  kindFilter,
  onKindFilterChange,
}: StatusTabFilterProps): ReactElement {
  const { filterStatus, setFilterStatus, refreshMessages } = vm;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v)}>
          <TabsList className="h-9">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs px-3">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => void refreshMessages()}
        >
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by message kind">
        {KIND_CHIPS.map((chip) => {
          const active = kindFilter === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-[32px]",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50",
              )}
              onClick={() => onKindFilterChange(chip.value)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
