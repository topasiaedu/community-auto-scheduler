/**
 * Queue — monitor all scheduled sends for the active workspace.
 */

import { useEffect, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useNmcasVm } from "../context/NmcasVmContext.js";
import { PageHeader } from "../components/PageHeader.js";
import { StatusTabFilter } from "../components/StatusTabFilter.js";
import { QueueCard } from "../components/QueueCard.js";

export function QueuePage(): ReactElement {
  const vm = useNmcasVm();

  useEffect(() => {
    document.title = "Queue · NMCAS";
  }, []);

  if (!vm.canUseApiRoutes) {
    return (
      <div className="page-stack">
        <PageHeader title="Queue" />
        <p className="text-sm text-muted-foreground">Sign in and select a project to view the send queue.</p>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Queue"
        description="All scheduled, sent, and draft sends for this workspace."
        actions={
          <Button asChild>
            <Link to="/compose">+ Compose</Link>
          </Button>
        }
      />

      <StatusTabFilter vm={vm} />

      {vm.messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="font-semibold text-foreground">Nothing here yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {vm.filterStatus === "FAILED"
              ? "No failed sends — good."
              : vm.filterStatus === "DRAFT"
                ? "No drafts saved."
                : vm.filterStatus === "SENT"
                  ? "Nothing sent yet."
                  : "No sends scheduled. Compose one to get started."}
          </p>
          {vm.filterStatus === "" ? (
            <Button asChild variant="outline" className="mt-1">
              <Link to="/compose">Compose a send</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2 list-none p-0">
          {vm.messages.map((m) => (
            <QueueCard key={m.id} message={m} vm={vm} />
          ))}
        </ul>
      )}
    </div>
  );
}
