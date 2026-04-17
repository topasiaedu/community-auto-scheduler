/**
 * Horizontal tab-pill status filter — uses shadcn Tabs.
 * All · Scheduled · Drafts · Sent · Failed
 */

import type { ReactElement } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Scheduled", value: "PENDING" },
  { label: "Drafts", value: "DRAFT" },
  { label: "Sent", value: "SENT" },
  { label: "Failed", value: "FAILED" },
] as const;

type StatusTabFilterProps = {
  vm: NmcasViewModel;
};

export function StatusTabFilter({ vm }: StatusTabFilterProps): ReactElement {
  const { filterStatus, setFilterStatus, filterType, setFilterType, refreshMessages } = vm;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs
        value={filterStatus}
        onValueChange={(v) => setFilterStatus(v)}
      >
        <TabsList className="h-9">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs px-3">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2">
        <Select
          value={filterType === "" ? "all" : filterType}
          onValueChange={(v) => setFilterType(v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="POST">Post</SelectItem>
            <SelectItem value="POLL">Poll</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => void refreshMessages()}
        >
          Refresh
        </Button>
      </div>
    </div>
  );
}
