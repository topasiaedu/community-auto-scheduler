/**
 * Queue — monitor all scheduled sends for the active workspace.
 */

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNmcasVm } from "../context/NmcasVmContext.js";
import { PageHeader } from "../components/PageHeader.js";
import { StatusTabFilter } from "../components/StatusTabFilter.js";
import { QueueCard } from "../components/QueueCard.js";
import { formatCampaignWebinarDate } from "../lib/campaignFormat.js";
import { groupQueueMessages } from "../lib/queueGrouping.js";
import { matchesQueueKindFilter, type QueueKindFilter } from "../lib/queueLabels.js";

type QueueLocationState = {
  expandCampaignId?: string;
};

export function QueuePage(): ReactElement {
  const vm = useNmcasVm();
  const location = useLocation();
  const [kindFilter, setKindFilter] = useState<QueueKindFilter>("all");
  const [expandedCampaignIds, setExpandedCampaignIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = "Queue · NMCAS";
  }, []);

  const filteredMessages = useMemo(
    () => vm.messages.filter((m) => matchesQueueKindFilter(m, kindFilter)),
    [vm.messages, kindFilter],
  );

  const { campaignGroups, otherMessages } = useMemo(
    () => groupQueueMessages(filteredMessages),
    [filteredMessages],
  );

  useEffect(() => {
    const state = location.state as QueueLocationState | null;
    const expandId = state?.expandCampaignId;
    if (expandId !== undefined && expandId.length > 0) {
      setExpandedCampaignIds((prev) => {
        const next = new Set(prev);
        next.add(expandId);
        return next;
      });
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    setExpandedCampaignIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const group of campaignGroups) {
        if (group.expandByDefault && !next.has(group.campaignId)) {
          next.add(group.campaignId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [campaignGroups]);

  const toggleCampaign = (campaignId: string): void => {
    setExpandedCampaignIds((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
      }
      return next;
    });
  };

  if (!vm.canUseApiRoutes) {
    return (
      <div className="page-stack">
        <PageHeader title="Queue" />
        <p className="text-sm text-muted-foreground">Sign in and select a project to view the send queue.</p>
      </div>
    );
  }

  const queueEmpty = vm.messages.length === 0;
  const filterEmpty = !queueEmpty && filteredMessages.length === 0;

  return (
    <div className="page-stack">
      <PageHeader
        title="Queue"
        description="All scheduled, sent, and draft sends for this workspace."
        actions={
          <Button asChild>
            <Link to="/schedule">+ Schedule</Link>
          </Button>
        }
      />

      <StatusTabFilter
        vm={vm}
        kindFilter={kindFilter}
        onKindFilterChange={setKindFilter}
      />

      {queueEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 px-6 text-center">
          <p className="font-semibold text-foreground">Nothing here yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Get started with these steps:
          </p>
          <ol className="max-w-sm space-y-2 text-left text-sm text-foreground">
            {!vm.waConnected ? (
              <li>
                <Link to="/whatsapp" className="font-medium text-primary hover:underline">
                  Link WhatsApp
                </Link>
              </li>
            ) : null}
            <li>
              <Link to="/settings#reminder-templates" className="font-medium text-primary hover:underline">
                Configure reminder templates
              </Link>
            </li>
            <li>
              <Link to="/schedule" className="font-medium text-primary hover:underline">
                Schedule a campaign
              </Link>
            </li>
          </ol>
        </div>
      ) : filterEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="font-semibold text-foreground">No matching messages</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Try a different status tab or kind filter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaignGroups.map((group) => {
            const expanded = expandedCampaignIds.has(group.campaignId);
            const headerDate =
              group.webinarDate.length > 0
                ? formatCampaignWebinarDate(group.webinarDate)
                : "Unknown date";
            return (
              <section
                key={group.campaignId}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  aria-expanded={expanded}
                  onClick={() => toggleCampaign(group.campaignId)}
                >
                  <span className="font-semibold text-sm">
                    Campaign · {headerDate}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {group.messages.length} message{group.messages.length === 1 ? "" : "s"}
                    <ChevronDownIcon
                      className={cn(
                        "size-4 transition-transform duration-200",
                        expanded ? "rotate-180" : "",
                      )}
                      aria-hidden="true"
                    />
                  </span>
                </button>
                {expanded ? (
                  <ul className="space-y-2 border-t border-border p-3 list-none">
                    {group.messages.map((m) => (
                      <QueueCard key={m.id} message={m} vm={vm} />
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}

          {otherMessages.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground px-1">
                Other messages
              </h2>
              <ul className="space-y-2 list-none p-0">
                {otherMessages.map((m) => (
                  <QueueCard key={m.id} message={m} vm={vm} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
