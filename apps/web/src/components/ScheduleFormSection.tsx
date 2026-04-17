/**
 * Compose form — unified card with natural top-to-bottom flow.
 * Group → Type → Content → When → Actions
 * Uses shadcn Button, Select, Textarea, Input, Label, Badge.
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatWaGroupPickerLabel } from "../lib/format.js";
import { ImageDropZone } from "./ImageDropZone.js";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";
import type { MessageKind } from "../types/models.js";

import { WHATSAPP_POST_TEXT_MAX_CHARS } from "../lib/whatsappLimits.js";

const POST_CHAR_LIMIT = WHATSAPP_POST_TEXT_MAX_CHARS;

type ScheduleFormSectionProps = {
  vm: NmcasViewModel;
};

export function ScheduleFormSection({ vm }: ScheduleFormSectionProps): ReactElement | null {
  const {
    canUseApiRoutes,
    waConnected,
    editingDraftId,
    formError,
    submitting,
    messageKind,
    setMessageKind,
    groupJid,
    groups,
    groupDuplicateNames,
    copyText,
    setCopyText,
    imagePath,
    clearPostImage,
    pollQuestion,
    setPollQuestion,
    pollOptions,
    setPollOptions,
    pollMultiSelect,
    setPollMultiSelect,
    scheduledLocal,
    setScheduledLocal,
    setFormError,
    onGroupSelect,
    onUploadImage,
    onSaveDraftOnly,
    onSchedule,
    clearScheduleForm,
  } = vm;

  if (!canUseApiRoutes) {
    return null;
  }

  const isEditing = editingDraftId !== null;
  const charLimitReached = copyText.length >= POST_CHAR_LIMIT * 0.9;

  return (
    <div className="space-y-4">
      {/* WA not connected notice */}
      {!waConnected ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertDescription className="flex flex-wrap items-center gap-2 text-sm">
            <span>WhatsApp not connected.</span>
            <Link to="/connect" className="font-semibold text-primary underline underline-offset-2">
              Link your account →
            </Link>
            <span className="text-amber-700">You can still save a draft.</span>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Editing draft banner */}
      {isEditing ? (
        <Alert className="border-blue-200 bg-blue-50 text-blue-800">
          <AlertDescription className="text-sm font-medium">
            Editing draft — schedule when ready or save to continue later.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Form error */}
      {formError !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── Single unified compose card ── */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        {/* Section: Group + Type */}
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="group-select" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Group
            </Label>
            <Select
              value={groupJid}
              onValueChange={(v) => {
                onGroupSelect(v);
                setFormError(null);
              }}
            >
              <SelectTrigger id="group-select" className="h-10">
                <SelectValue placeholder="Select a WhatsApp group…" />
              </SelectTrigger>
              <SelectContent>
                {groups.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {waConnected
                      ? "No groups yet — go to Connect and load groups."
                      : "Connect WhatsApp first."}
                  </div>
                ) : (
                  groups.map((g) => (
                    <SelectItem key={g.jid} value={g.jid} title={g.jid}>
                      {formatWaGroupPickerLabel(g, groupDuplicateNames)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground leading-snug">
              When WhatsApp links a group to a Community, we show{" "}
              <span className="font-medium">community name › group name</span> (from your account&apos;s
              metadata).{" "}
              {groupDuplicateNames.size > 0 ? (
                <>
                  If two lines still look the same, the <span className="font-mono">· …12345678</span>{" "}
                  suffix is the unique group id.
                </>
              ) : null}
            </p>
          </div>

          {/* Post / Poll toggle */}
          <div className="flex-shrink-0 space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Type
            </Label>
            <div className="flex rounded-lg border border-border overflow-hidden h-10">
              {(["POST", "POLL"] as MessageKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setMessageKind(k);
                    setFormError(null);
                  }}
                  className={cn(
                    "flex-1 px-5 text-sm font-medium transition-colors",
                    messageKind === k
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {k === "POST" ? "Post" : "Poll"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        {/* Section: Content */}
        <div className="p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {messageKind === "POST" ? "Post content" : "Poll details"}
          </p>

          {messageKind === "POST" ? (
            <>
              <div className="space-y-1">
                <Textarea
                  id="post-body"
                  placeholder="What would you like to share with the group?"
                  value={copyText}
                  rows={5}
                  maxLength={POST_CHAR_LIMIT}
                  onChange={(e) => setCopyText(e.target.value)}
                  className="resize-y text-sm leading-relaxed"
                />
                <p
                  className={cn(
                    "text-right text-xs tabular-nums",
                    charLimitReached ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {String(copyText.length).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} /{" "}
                  {String(POST_CHAR_LIMIT).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                </p>
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium">
                  Image <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <ImageDropZone
                  imagePath={imagePath}
                  onUpload={onUploadImage}
                  onRemove={() => clearPostImage()}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="poll-q">Question</Label>
                <Input
                  id="poll-q"
                  type="text"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  maxLength={4096}
                  placeholder="What would you like to ask?"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Options (2–12)</Label>
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center text-xs flex-shrink-0">
                      {String.fromCharCode(65 + idx)}
                    </Badge>
                    <Input
                      type="text"
                      value={opt}
                      placeholder={`Option ${String(idx + 1)}`}
                      onChange={(e) => {
                        const next = [...pollOptions];
                        next[idx] = e.target.value;
                        setPollOptions(next);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pollOptions.length <= 2}
                      className="shrink-0 text-muted-foreground"
                      onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pollOptions.length >= 12}
                  onClick={() => setPollOptions([...pollOptions, ""])}
                >
                  + Add option
                </Button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input
                  type="checkbox"
                  checked={pollMultiSelect}
                  onChange={(e) => setPollMultiSelect(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span>Allow multiple answers</span>
              </label>
            </>
          )}
        </div>

        <Separator />

        {/* Section: When */}
        <div className="p-5 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="send-at" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Send at <span className="font-normal normal-case text-muted-foreground">(MYT, UTC+8)</span>
            </Label>
            <Input
              id="send-at"
              type="datetime-local"
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
              className="h-10"
              title="Malaysia Time (MYT, UTC+8)"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={submitting}
              className="min-w-[130px]"
              onClick={() => void onSchedule()}
            >
              {submitting
                ? "Scheduling…"
                : isEditing
                  ? "Update schedule →"
                  : "Schedule →"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() =>
                isEditing ? void onSaveDraftOnly() : clearScheduleForm()
              }
            >
              {isEditing ? "Save draft" : "Clear"}
            </Button>
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => clearScheduleForm()}
              >
                Cancel edit
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
