/**
 * Individual scheduled-send row with status accent stripe, chevron expand,
 * and inline cancel confirmation. Uses shadcn Badge, Button.
 */

import { useEffect, useState, type ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { utcIsoToDatetimeLocalMyt } from "../myt.js";
import { MessagePreview } from "./MessagePreview.js";
import {
  formatAttributedBy,
  formatRelativeTime,
  formatStatusLabel,
  stripCommunityShellPrefix,
} from "../lib/format.js";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";
import type { ScheduledMessage } from "../types/models.js";

function accentClass(status: string): string {
  switch (status) {
    case "PENDING":
    case "SENDING":
      return "bg-primary";
    case "SENT":
      return "bg-emerald-500";
    case "FAILED":
      return "bg-destructive";
    case "DRAFT":
      return "bg-blue-400";
    case "CANCELLED":
      return "bg-muted-foreground/40";
    default:
      return "bg-primary";
  }
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "SENT":
      return "default";
    case "FAILED":
      return "destructive";
    case "CANCELLED":
      return "secondary";
    default:
      return "outline";
  }
}

type QueueCardProps = {
  message: ScheduledMessage;
  vm: NmcasViewModel;
};

export function QueueCard({ message: m, vm }: QueueCardProps): ReactElement {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [requeueConfirming, setRequeueConfirming] = useState(false);

  const {
    expandedMessageId,
    setExpandedMessageId,
    cancelConfirmId,
    requestCancelMessage,
    dismissCancelConfirm,
    onCancelMessage,
    onRequeueMessage,
    onStartEditPending,
    onContinueDraft,
    session,
    fetchPostImageObjectUrl,
  } = vm;

  useEffect(() => {
    if (!previewOpen) {
      setPreviewImageSrc((prev) => {
        if (prev !== null) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      return;
    }
    if (m.type !== "POST" || m.imageUrl === null || m.imageUrl.length === 0) {
      return;
    }
    let cancelled = false;
    void fetchPostImageObjectUrl(m.imageUrl).then((url) => {
      if (!cancelled && url !== null) {
        setPreviewImageSrc(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [previewOpen, m.type, m.imageUrl, fetchPostImageObjectUrl]);

  const isExpanded = expandedMessageId === m.id;
  const isConfirmingCancel = cancelConfirmId === m.id;
  const attribution = formatAttributedBy(m.createdByUserId, session?.user.id);
  const canCancel = m.status === "PENDING" || m.status === "DRAFT";
  const groupDisplayName = stripCommunityShellPrefix(m.groupName);

  return (
    <li className="flex overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Left accent stripe */}
      <div className={cn("w-1 flex-shrink-0", accentClass(m.status))} aria-hidden="true" />

      <div className="flex-1 min-w-0 p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
            <span className="font-semibold text-sm truncate">{groupDisplayName}</span>
            <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-indigo-50 text-indigo-700 border-indigo-200">
              {m.type === "POLL" ? "Poll" : "Post"}
            </Badge>
            <Badge
              variant={statusBadgeVariant(m.status)}
              className={cn(
                "text-[11px] px-1.5 py-0",
                m.status === "SENT" && "bg-emerald-100 text-emerald-700 border-emerald-200",
                m.status === "PENDING" && "bg-amber-50 text-amber-700 border-amber-200",
                m.status === "SENDING" && "bg-amber-50 text-amber-700 border-amber-200",
                m.status === "DRAFT" && "bg-blue-50 text-blue-700 border-blue-200",
              )}
            >
              {formatStatusLabel(m.status)}
            </Badge>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setPreviewOpen(true)}
            >
              Preview
            </Button>
          <button
            type="button"
            className={cn(
              "text-muted-foreground text-lg leading-none transition-transform flex-shrink-0 hover:text-foreground",
              isExpanded && "rotate-90",
            )}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            onClick={() =>
              setExpandedMessageId((id) => (id === m.id ? null : m.id))
            }
          >
            ›
          </button>
          </div>
        </div>

        {/* Time + attribution */}
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{formatRelativeTime(m.scheduledAt)}</span>
          {attribution.length > 0 ? <span>· {attribution}</span> : null}
        </div>

        {/* Expanded detail */}
        {isExpanded ? (
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
            {m.type === "POLL" && m.pollQuestion !== null ? (
              <>
                <p className="font-semibold mb-1">{m.pollQuestion}</p>
                <ul className="list-disc pl-4 text-xs space-y-0.5 text-muted-foreground">
                  {(m.pollOptions ?? []).map((o, i) => (
                    <li key={`${m.id}-opt-${String(i)}`}>{o}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {m.type !== "POLL" && m.copyText !== null && m.copyText.length > 0 ? (
              <p className="whitespace-pre-wrap">{m.copyText}</p>
            ) : null}
            {m.type !== "POLL" && m.imageUrl !== null ? (
              <p className="text-xs text-muted-foreground mt-1">📎 Image attached</p>
            ) : null}
            {m.error !== null ? (
              <p className="mt-2 text-xs text-destructive">{m.error}</p>
            ) : null}
          </div>
        ) : null}

        {/* Inline error preview for failed */}
        {m.status === "FAILED" && !isExpanded && m.error !== null ? (
          <p className="mt-1 text-xs text-destructive truncate">{m.error}</p>
        ) : null}

        {/* Actions */}
        {m.status === "FAILED" && !requeueConfirming ? (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => setRequeueConfirming(true)}
            >
              Re-queue
            </Button>
          </div>
        ) : null}

        {m.status === "FAILED" && requeueConfirming ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-destructive">
              Only re-queue if the message was NOT sent to the group.
            </span>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={() => { setRequeueConfirming(false); void onRequeueMessage(m); }}
            >
              Yes, re-send
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setRequeueConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        ) : null}
        {m.status === "PENDING" && !isConfirmingCancel ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void onStartEditPending(m)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => void onRequeueMessage(m)}
            >
              Re-queue job
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => requestCancelMessage(m.id)}
            >
              Cancel send
            </Button>
          </div>
        ) : null}

        {m.status === "SENDING" && !isConfirmingCancel ? (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => void onRequeueMessage(m)}
            >
              Re-queue stuck send
            </Button>
          </div>
        ) : null}

        {m.status === "DRAFT" && !isConfirmingCancel ? (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => void onContinueDraft(m)}
            >
              Resume
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => requestCancelMessage(m.id)}
            >
              Discard
            </Button>
          </div>
        ) : null}

        {canCancel && isConfirmingCancel ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">
              {m.status === "DRAFT" ? "Discard this draft?" : "Cancel this send?"}
            </span>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={() => void onCancelMessage(m)}
            >
              {m.status === "DRAFT" ? "Yes, discard" : "Yes, cancel"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => dismissCancelConfirm()}
            >
              Never mind
            </Button>
          </div>
        ) : null}

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-md max-h-[min(90vh,800px)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Message preview</DialogTitle>
            </DialogHeader>
            <MessagePreview
              kind={m.type === "POLL" ? "POLL" : "POST"}
              groupTitle={groupDisplayName}
              copyText={m.copyText ?? ""}
              pollQuestion={m.pollQuestion ?? ""}
              pollOptions={m.pollOptions ?? []}
              pollMultiSelect={m.pollMultiSelect}
              imageSrc={m.type === "POST" ? previewImageSrc : null}
              scheduledLocal={utcIsoToDatetimeLocalMyt(m.scheduledAt)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </li>
  );
}
