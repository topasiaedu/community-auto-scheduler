/**
 * Compose form — unified card with natural top-to-bottom flow.
 * Group → Type → Content → When → Actions
 * Uses shadcn Button, Select, Textarea, Input, Label, Badge.
 */

import { useMemo, useState, type ReactElement } from "react";
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
import {
  formatWaGroupPickerLabel,
  waGroupChannelLabel,
  waGroupCommunityKey,
  waGroupCommunityLabel,
} from "../lib/format.js";
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

  /** Keeps community selection when the channel dropdown was cleared. */
  const [communityKeyOverride, setCommunityKeyOverride] = useState("");

  const selectedCommunityKey = useMemo(() => {
    const selected = groups.find((g) => g.jid === groupJid);
    if (selected !== undefined) {
      return waGroupCommunityKey(selected);
    }
    return communityKeyOverride;
  }, [groups, groupJid, communityKeyOverride]);

  const communityOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      const key = waGroupCommunityKey(g);
      if (!map.has(key)) {
        map.set(key, waGroupCommunityLabel(g));
      }
    }
    return [...map.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [groups]);

  const channelOptions = useMemo(() => {
    if (selectedCommunityKey.length === 0) {
      return [];
    }
    return groups
      .filter((g) => waGroupCommunityKey(g) === selectedCommunityKey)
      .sort((a, b) => waGroupChannelLabel(a).localeCompare(waGroupChannelLabel(b)));
  }, [groups, selectedCommunityKey]);

  const channelDuplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of channelOptions) {
      const key = waGroupChannelLabel(g);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const duplicate = new Set<string>();
    for (const [k, c] of counts) {
      if (c > 1) {
        duplicate.add(k);
      }
    }
    return duplicate;
  }, [channelOptions]);

  const onCommunityChange = (key: string): void => {
    setCommunityKeyOverride(key);
    const channels = groups.filter((g) => waGroupCommunityKey(g) === key);
    if (channels.length === 1) {
      const only = channels[0];
      if (only !== undefined) {
        onGroupSelect(only.jid);
      }
      return;
    }
    if (!channels.some((g) => g.jid === groupJid)) {
      onGroupSelect("");
    }
  };

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
        {/* Section: Community + channel/group + Type */}
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label
                htmlFor="community-select"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Community
              </Label>
              <Select
                value={selectedCommunityKey}
                onValueChange={(v) => {
                  onCommunityChange(v);
                  setFormError(null);
                }}
              >
                <SelectTrigger id="community-select" className="h-10">
                  <SelectValue placeholder="Select a community…" />
                </SelectTrigger>
                <SelectContent>
                  {communityOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {waConnected
                        ? "No groups yet — go to Connect and load groups."
                        : "Connect WhatsApp first."}
                    </div>
                  ) : (
                    communityOptions.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <Label
                htmlFor="group-select"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Group
              </Label>
              <Select
                value={groupJid}
                onValueChange={(v) => {
                  onGroupSelect(v);
                  setFormError(null);
                }}
                disabled={selectedCommunityKey.length === 0}
              >
                <SelectTrigger id="group-select" className="h-10">
                  <SelectValue
                    placeholder={
                      selectedCommunityKey.length === 0
                        ? "Pick a community first…"
                        : "Select Announcements or a group…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {channelOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {selectedCommunityKey.length === 0
                        ? "Pick a community first."
                        : "No groups in this community."}
                    </div>
                  ) : (
                    channelOptions.map((g) => {
                      const channelLabel = waGroupChannelLabel(g);
                      const showHint = channelDuplicateNames.has(channelLabel);
                      return (
                        <SelectItem key={g.jid} value={g.jid} title={g.jid}>
                          {showHint
                            ? formatWaGroupPickerLabel(
                                { ...g, label: channelLabel, name: channelLabel },
                                channelDuplicateNames,
                              )
                            : channelLabel}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground leading-snug">
                Community announcement channels show as <strong>Announcements</strong>.
              </p>
            </div>
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
