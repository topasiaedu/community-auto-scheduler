/**
 * Single-message schedule form — Value (image/poll/text) or Reminder (P7 UX spec §5).
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isUtcIsoAtLeastSecondsAhead } from "../../myt.js";
import {
  buildSingleMessageBody,
  singleMessageFormatLabel,
  singleMessagePreviewBody,
} from "../../lib/singleMessageBuilders.js";
import { mergeTemplate } from "../../lib/mergeTemplate.js";
import { SAMPLE_CUSTOM_VALUES } from "../../lib/sampleCustomValues.js";
import { templateHasRequiredAssets } from "../../lib/templateValidation.js";
import { useMediaObjectUrl } from "../../hooks/useMediaObjectUrl.js";
import type { NmcasViewModel } from "../../hooks/useNmcasApp.js";
import type {
  CampaignCustomValues,
  OperatorKind,
  ReminderTemplateRow,
  ValueFormat,
} from "../../types/models.js";
import { WHATSAPP_POST_TEXT_MAX_CHARS } from "../../lib/whatsappLimits.js";
import { CommunityChannelPicker } from "./CommunityChannelPicker.js";
import { ImageDropZone } from "../ImageDropZone.js";
import { MessagePreview } from "../MessagePreview.js";

const POST_CHAR_LIMIT = WHATSAPP_POST_TEXT_MAX_CHARS;

const CUSTOM_VALUE_FIELDS: { key: keyof CampaignCustomValues; label: string }[] = [
  { key: "workshopDay", label: "Workshop day" },
  { key: "workshopDate", label: "Workshop date" },
  { key: "workshopTime", label: "Workshop time" },
  { key: "zoomLink", label: "Zoom link" },
  { key: "sessionDate", label: "Session date" },
  { key: "sessionTime", label: "Session time" },
  { key: "zoomId", label: "Zoom ID" },
  { key: "zoomPasscode", label: "Zoom passcode" },
];

type SingleMessageSectionProps = {
  vm: NmcasViewModel;
};

export function SingleMessageSection({ vm }: SingleMessageSectionProps): ReactElement | null {
  const {
    canUseApiRoutes,
    waConnected,
    groups,
    groupJid,
    groupPickerLabel,
    copyText,
    setCopyText,
    imagePath,
    clearPostImage,
    pollQuestion,
    setPollQuestion,
    pollOptions,
    setPollOptions,
    pollMultiSelect,
    scheduledLocal,
    setScheduledLocal,
    submitting,
    formError,
    setFormError,
    onGroupSelect,
    onUploadImage,
    onSaveDraftOnly,
    editingDraftId,
    clearScheduleForm,
    authorizedFetch,
    MIN_LEAD_SECONDS,
  } = vm;

  const [operatorKind, setOperatorKind] = useState<OperatorKind>("VALUE");
  const [valueFormat, setValueFormat] = useState<ValueFormat>("IMAGE_CAPTION");
  const [templates, setTemplates] = useState<ReminderTemplateRow[]>([]);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [customValues, setCustomValues] = useState<CampaignCustomValues>(SAMPLE_CUSTOM_VALUES);
  const [showPreviewValues, setShowPreviewValues] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [localSubmitting, setLocalSubmitting] = useState(false);

  const isEditing = editingDraftId !== null;

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.slotKey === selectedSlotKey),
    [templates, selectedSlotKey],
  );

  const reminderPreviewText = useMemo(() => {
    if (selectedTemplate === undefined || selectedTemplate.bodyTemplate === null) {
      return "";
    }
    return mergeTemplate(customValues, selectedTemplate.bodyTemplate);
  }, [selectedTemplate, customValues]);

  const templateMediaPath = useMemo(() => {
    if (selectedTemplate === undefined) {
      return null;
    }
    if (selectedTemplate.reminderFormat === "STICKER") {
      return selectedTemplate.stickerUrl;
    }
    if (selectedTemplate.reminderFormat === "IMAGE") {
      return selectedTemplate.mediaUrl;
    }
    return null;
  }, [selectedTemplate]);

  const templateMediaUrl = useMediaObjectUrl(authorizedFetch, templateMediaPath);

  const loadTemplates = useCallback(async () => {
    const res = await authorizedFetch("/templates");
    if (!res.ok) {
      setTemplates([]);
      return;
    }
    const json = (await res.json()) as { templates?: ReminderTemplateRow[] };
    const list = Array.isArray(json.templates) ? json.templates : [];
    setTemplates(list);
    if (list.length > 0 && selectedSlotKey.length === 0) {
      const first = list[0];
      if (first !== undefined) {
        setSelectedSlotKey(first.slotKey);
      }
    }
  }, [authorizedFetch, selectedSlotKey]);

  useEffect(() => {
    if (canUseApiRoutes && operatorKind === "REMINDER") {
      void loadTemplates();
    }
  }, [canUseApiRoutes, operatorKind, loadTemplates]);

  if (!canUseApiRoutes) {
    return null;
  }

  const buildFields = () => ({
    operatorKind,
    valueFormat,
    scheduledLocal,
    groupJid,
    groupName: groupPickerLabel,
    copyText: operatorKind === "REMINDER" ? reminderPreviewText : copyText,
    imagePath,
    pollQuestion,
    pollOptions,
    pollMultiSelect,
    reminderTemplateId: selectedTemplate?.id ?? "",
    customValues,
  });

  const requestSchedule = (): void => {
    setFormError(null);
    if (!waConnected) {
      setFormError("Connect WhatsApp first (see Link WhatsApp).");
      return;
    }
    if (groupJid.length === 0) {
      setFormError("Pick a destination community channel.");
      return;
    }

    const bodyResult = buildSingleMessageBody(buildFields());
    if (!bodyResult.ok) {
      setFormError(bodyResult.error);
      return;
    }

    const scheduledAt = bodyResult.body.scheduledAt;
    if (typeof scheduledAt !== "string" || !isUtcIsoAtLeastSecondsAhead(scheduledAt, MIN_LEAD_SECONDS)) {
      setFormError(
        `Choose a send time at least ${String(MIN_LEAD_SECONDS)} seconds from now (Malaysia time).`,
      );
      return;
    }

    setConfirmOpen(true);
  };

  const confirmSchedule = (): void => {
    const bodyResult = buildSingleMessageBody(buildFields());
    if (!bodyResult.ok) {
      setFormError(bodyResult.error);
      setConfirmOpen(false);
      return;
    }

    setLocalSubmitting(true);
    void (async () => {
      const res = await authorizedFetch("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyResult.body),
      });
      setLocalSubmitting(false);
      setConfirmOpen(false);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(err.error ?? `Schedule failed (${String(res.status)})`);
        return;
      }
      toast("Message scheduled.");
      clearScheduleForm();
      vm.refreshMessages();
    })();
  };

  const previewKindForMessage =
    operatorKind === "REMINDER"
      ? "POST"
      : valueFormat === "POLL"
        ? "POLL"
        : "POST";

  const isBusy = submitting || localSubmitting;

  return (
    <div className="compose-layout">
      <div className="compose-layout__form">
        <div className="space-y-4">
      {!waConnected ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertDescription className="flex flex-wrap items-center gap-2 text-sm">
            <span>WhatsApp not connected.</span>
            <Link to="/whatsapp" className="font-semibold text-primary underline underline-offset-2">
              Link your account →
            </Link>
            <span className="text-amber-700">You can still save a draft when editing.</span>
          </AlertDescription>
        </Alert>
      ) : null}

      {isEditing ? (
        <Alert className="border-blue-200 bg-blue-50 text-blue-800">
          <AlertDescription className="text-sm font-medium">
            Editing draft — schedule when ready or save to continue later.
          </AlertDescription>
        </Alert>
      ) : null}

      {formError !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {/* Where */}
        <div className="p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Where</p>
          <CommunityChannelPicker
            groups={groups}
            groupJid={groupJid}
            waConnected={waConnected}
            onGroupSelect={onGroupSelect}
            idPrefix="single"
          />
        </div>

        <Separator />

        {/* What kind */}
        <div className="p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What kind
          </p>
          <div className="flex h-10 max-w-xs overflow-hidden rounded-lg border border-border">
            {(["VALUE", "REMINDER"] as OperatorKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setOperatorKind(k);
                  setFormError(null);
                }}
                className={cn(
                  "flex-1 px-4 text-sm font-medium transition-colors min-h-[44px]",
                  operatorKind === k
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {k === "VALUE" ? "Value post" : "Reminder"}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Content
          </p>

          {operatorKind === "VALUE" ? (
            <>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { fmt: "IMAGE_CAPTION" as const, label: "Image + caption" },
                    { fmt: "POLL" as const, label: "Poll" },
                    { fmt: "TEXT_ONLY" as const, label: "Text only" },
                  ] as const
                ).map(({ fmt, label }) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setValueFormat(fmt)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium min-h-[44px]",
                      valueFormat === fmt
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {valueFormat === "POLL" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="poll-q">Question</Label>
                    <Input
                      id="poll-q"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="What would you like to ask?"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Options (2–12)</Label>
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center text-xs">
                          {String.fromCharCode(65 + idx)}
                        </Badge>
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const next = [...pollOptions];
                            next[idx] = e.target.value;
                            setPollOptions(next);
                          }}
                        />
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
                </>
              ) : (
                <>
                  <Textarea
                    placeholder={
                      valueFormat === "TEXT_ONLY"
                        ? "Message text"
                        : "Caption (required with image)"
                    }
                    value={copyText}
                    rows={5}
                    maxLength={POST_CHAR_LIMIT}
                    onChange={(e) => setCopyText(e.target.value)}
                  />
                  {valueFormat === "IMAGE_CAPTION" ? (
                    <ImageDropZone
                      imagePath={imagePath}
                      onUpload={onUploadImage}
                      onRemove={() => clearPostImage()}
                    />
                  ) : null}
                </>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5 max-w-md">
                <Label>Reminder slot</Label>
                <Select value={selectedSlotKey} onValueChange={setSelectedSlotKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a template slot…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.slotKey} value={t.slotKey}>
                        {t.name}
                        {!templateHasRequiredAssets(t) ? " (incomplete)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <details
                open={showPreviewValues}
                onToggle={(e) => setShowPreviewValues(e.currentTarget.open)}
              >
                <summary className="cursor-pointer text-sm font-medium">Preview values</summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {CUSTOM_VALUE_FIELDS.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        value={customValues[key]}
                        onChange={(e) =>
                          setCustomValues((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </details>

              {selectedTemplate !== undefined ? (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Merged preview</p>
                  {selectedTemplate.reminderFormat === "STICKER" ? (
                    <div className="h-24 w-24 rounded border bg-[repeating-conic-gradient(#e5e5e5_0%_25%,#fff_0%_50%)] bg-[length:8px_8px] flex items-center justify-center">
                      {templateMediaUrl !== null ? (
                        <img src={templateMediaUrl} alt="" className="h-full w-full object-contain" />
                      ) : null}
                    </div>
                  ) : selectedTemplate.reminderFormat === "IMAGE" && templateMediaUrl !== null ? (
                    <img src={templateMediaUrl} alt="" className="max-h-32 rounded border object-cover" />
                  ) : null}
                  {reminderPreviewText.length > 0 ? (
                    <p className="text-sm whitespace-pre-wrap">{reminderPreviewText}</p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <Separator />

        {/* When */}
        <div className="p-5 flex flex-wrap items-end gap-4 sticky bottom-0 bg-card/95 backdrop-blur-sm border-t border-border sm:border-0 sm:static sm:bg-transparent sm:backdrop-blur-none">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="send-at">Send at (MYT, UTC+8)</Label>
            <Input
              id="send-at"
              type="datetime-local"
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={isBusy}
              className="min-w-[130px] min-h-[44px]"
              onClick={() => requestSchedule()}
            >
              {isBusy ? "Scheduling…" : "Schedule →"}
            </Button>
            {isEditing ? (
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => void onSaveDraftOnly()}
              >
                Save draft
              </Button>
            ) : null}
          </div>
        </div>
      </div>
        </div>
      </div>
      <div className="compose-layout__preview">
        <MessagePreview
          kind={previewKindForMessage}
          groupTitle={groupPickerLabel}
          copyText={operatorKind === "REMINDER" ? reminderPreviewText : copyText}
          pollQuestion={pollQuestion}
          pollOptions={pollOptions}
          pollMultiSelect={pollMultiSelect}
          imageSrc={
            operatorKind === "REMINDER"
              ? templateMediaUrl
              : vm.composeImageDisplayUrl
          }
          scheduledLocal={scheduledLocal}
        />
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule this message?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong>Destination:</strong> {groupPickerLabel || "—"}
                </p>
                <p>
                  <strong>Kind:</strong> {operatorKind === "VALUE" ? "Value" : "Reminder"} ·{" "}
                  {singleMessageFormatLabel(buildFields())}
                </p>
                <p>
                  <strong>Send at:</strong> {scheduledLocal.replace("T", " ")} MYT
                </p>
                <p className="line-clamp-3">
                  <strong>Preview:</strong> {singleMessagePreviewBody(buildFields()) || "—"}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isBusy} onClick={() => confirmSchedule()}>
              Confirm schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
