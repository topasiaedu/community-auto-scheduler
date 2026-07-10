/**
 * Four-step Show Up campaign wizard (reminders only — Value posts use Single message mode).
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  buildOperatorSkipSlotKeys,
  classifyCampaignSlots,
  computeShowUpSlots,
  countScheduledCampaignSlots,
  getDefaultSelectedSlotKeys,
  getSchedulableSlotKeys,
  hasPastCampaignSlots,
  isWebinarDateValid,
} from "../../lib/campaignSchedule.js";
import { formatUtcIsoMyt, REMINDER_SLOT_LABELS } from "../../lib/campaignFormat.js";
import {
  deriveCustomValues,
  loadZoomDefaults,
  saveZoomDefaults,
  ZOOM_FIELD_PLACEHOLDERS,
  type ZoomFields,
} from "../../lib/deriveCustomValues.js";
import {
  mergePreviewForSlot,
  templateHasRequiredAssets,
  templateReadyForCampaign,
} from "../../lib/templateValidation.js";
import { useMediaObjectUrl } from "../../hooks/useMediaObjectUrl.js";
import type { NmcasViewModel } from "../../hooks/useNmcasApp.js";
import type { CampaignCustomValues, ReminderTemplateRow } from "../../types/models.js";
import { CommunityChannelPicker } from "./CommunityChannelPicker.js";

const WIZARD_STEPS = [
  "Campaign details",
  "Reminder destination",
  "Show Up review",
  "Confirm",
] as const;

type CampaignWizardProps = {
  vm: NmcasViewModel;
};

function isValidZoomLink(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function TemplatePreviewThumb({
  template,
  authorizedFetch,
}: {
  template: ReminderTemplateRow;
  authorizedFetch: NmcasViewModel["authorizedFetch"];
}): ReactElement {
  const fetchMedia = useCallback(
    (path: string) => authorizedFetch(path),
    [authorizedFetch],
  );
  const mediaPath =
    template.reminderFormat === "STICKER" ? template.stickerUrl : template.mediaUrl;
  const src = useMediaObjectUrl(fetchMedia, mediaPath);

  if (template.reminderFormat === "STICKER") {
    return (
      <div className="h-12 w-12 shrink-0 rounded border border-border sticker-preview-bg flex items-center justify-center overflow-hidden">
        {src !== null ? (
          <img src={src} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </div>
    );
  }

  if (template.reminderFormat === "IMAGE" && src !== null) {
    return (
      <img src={src} alt="" className="h-12 w-16 shrink-0 rounded border object-cover" />
    );
  }

  return <span className="text-xs text-muted-foreground shrink-0">Text only</span>;
}

export function CampaignWizard({ vm }: CampaignWizardProps): ReactElement {
  const navigate = useNavigate();
  const { authorizedFetch, canUseApiRoutes, selectedProjectId } = vm;

  const [step, setStep] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [webinarDate, setWebinarDate] = useState("");
  const [eventStartTimeMyt, setEventStartTimeMyt] = useState("20:00");
  const [zoomFields, setZoomFields] = useState<ZoomFields>(() =>
    loadZoomDefaults(selectedProjectId),
  );

  const [reminderGroupJid, setReminderGroupJid] = useState("");
  const [reminderGroupName, setReminderGroupName] = useState("");
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());

  const [templates, setTemplates] = useState<ReminderTemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const markDirty = useCallback(() => setDirty(true), []);

  const selectedProject = vm.projects.find((p) => p.id === vm.selectedProjectId);
  const sopUrl = selectedProject?.sopUrl ?? null;

  useEffect(() => {
    setZoomFields(loadZoomDefaults(selectedProjectId));
  }, [selectedProjectId]);

  const customValues: CampaignCustomValues = useMemo(() => {
    if (webinarDate.length === 0) {
      return deriveCustomValues("2099-01-01", eventStartTimeMyt, zoomFields);
    }
    return deriveCustomValues(webinarDate, eventStartTimeMyt, zoomFields);
  }, [webinarDate, eventStartTimeMyt, zoomFields]);

  const showUpSlots = useMemo(() => {
    if (webinarDate.length === 0) {
      return [];
    }
    try {
      return computeShowUpSlots(webinarDate, eventStartTimeMyt);
    } catch {
      return [];
    }
  }, [webinarDate, eventStartTimeMyt]);

  const templatesBySlotKey = useMemo(() => {
    const map = new Map<
      string,
      { reminderFormat: string; stickerUrl: string | null }
    >();
    for (const t of templates) {
      map.set(t.slotKey, {
        reminderFormat: t.reminderFormat,
        stickerUrl: t.stickerUrl,
      });
    }
    return map;
  }, [templates]);

  const schedulableSlotKeys = useMemo(() => {
    if (showUpSlots.length === 0) {
      return [];
    }
    return getSchedulableSlotKeys({
      slots: showUpSlots,
      templatesBySlotKey,
    });
  }, [showUpSlots, templatesBySlotKey]);

  useEffect(() => {
    if (showUpSlots.length === 0) {
      setSelectedSlotKeys(new Set());
      return;
    }
    setSelectedSlotKeys((prev) => {
      const schedulableSet = new Set(schedulableSlotKeys);
      if (prev.size === 0) {
        return getDefaultSelectedSlotKeys(schedulableSlotKeys);
      }
      const next = new Set<string>();
      for (const key of prev) {
        if (schedulableSet.has(key)) {
          next.add(key);
        }
      }
      if (next.size === 0 && schedulableSet.size > 0) {
        return getDefaultSelectedSlotKeys(schedulableSlotKeys);
      }
      return next;
    });
  }, [showUpSlots, schedulableSlotKeys]);

  const skipSlotKeys = useMemo(
    () => buildOperatorSkipSlotKeys(schedulableSlotKeys, selectedSlotKeys),
    [schedulableSlotKeys, selectedSlotKeys],
  );

  const classifiedSlots = useMemo(() => {
    if (showUpSlots.length === 0) {
      return [];
    }
    return classifyCampaignSlots({
      slots: showUpSlots,
      skipSlotKeys,
      templatesBySlotKey,
    });
  }, [showUpSlots, skipSlotKeys, templatesBySlotKey]);

  const hasPastSlots = hasPastCampaignSlots(classifiedSlots);
  const scheduledReminderCount = countScheduledCampaignSlots(classifiedSlots);
  const skippedReminderCount = classifiedSlots.length - scheduledReminderCount;

  const loadTemplates = useCallback(async () => {
    if (!canUseApiRoutes) {
      return;
    }
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await authorizedFetch("/templates");
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setTemplates([]);
        setTemplatesError(
          err.error ??
            `Could not load templates (${String(res.status)}). Run db:deploy if this is a fresh setup.`,
        );
        return;
      }
      const json = (await res.json()) as { templates?: ReminderTemplateRow[] };
      setTemplates(Array.isArray(json.templates) ? json.templates : []);
    } catch {
      setTemplates([]);
      setTemplatesError("Could not load templates. Check the API is running.");
    } finally {
      setTemplatesLoading(false);
    }
  }, [authorizedFetch, canUseApiRoutes]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates, selectedProjectId]);

  useEffect(() => {
    if (step === 3) {
      void loadTemplates();
    }
  }, [step, loadTemplates]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (step > 1 && dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step, dirty]);

  const onReminderGroupSelect = (jid: string): void => {
    markDirty();
    setReminderGroupJid(jid);
    const g = vm.groups.find((x) => x.jid === jid);
    setReminderGroupName(g !== undefined ? (g.label ?? g.name) : "");
  };

  const toggleSlotSelection = (slotKey: string, checked: boolean): void => {
    if (!schedulableSlotKeys.includes(slotKey)) {
      return;
    }
    markDirty();
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(slotKey);
      } else {
        next.delete(slotKey);
      }
      return next;
    });
  };

  const updateZoomField = (key: keyof ZoomFields, value: string): void => {
    markDirty();
    setZoomFields((prev) => {
      const next = { ...prev, [key]: value };
      saveZoomDefaults(selectedProjectId, next);
      return next;
    });
  };

  const step1Valid = useMemo(() => {
    if (webinarDate.length === 0 || eventStartTimeMyt.length === 0) {
      return false;
    }
    if (!isWebinarDateValid(webinarDate)) {
      return false;
    }
    if (zoomFields.zoomId.trim().length === 0 || zoomFields.zoomPasscode.trim().length === 0) {
      return false;
    }
    if (!isValidZoomLink(zoomFields.zoomLink)) {
      return false;
    }
    return true;
  }, [webinarDate, eventStartTimeMyt, zoomFields]);

  const step2Valid = reminderGroupJid.length > 0 && vm.waConnected;

  const step3Valid = useMemo(() => {
    if (templates.length === 0) {
      return false;
    }
    for (const t of templates) {
      if (!templateReadyForCampaign(t)) {
        return false;
      }
      const preview = mergePreviewForSlot(t, customValues);
      if (!preview.ok && t.reminderFormat !== "STICKER") {
        return false;
      }
    }
    return scheduledReminderCount > 0;
  }, [templates, customValues, scheduledReminderCount]);

  const stepValid = [step1Valid, step2Valid, step3Valid, step3Valid][step - 1] ?? false;

  const buildSchedulePayload = (): Record<string, unknown> => ({
    webinarDate,
    eventStartTimeMyt,
    customValues: deriveCustomValues(webinarDate, eventStartTimeMyt, zoomFields),
    reminderGroupJid,
    reminderGroupName,
    valuePosts: [],
    optionalValuePosts: [],
    skipSlotKeys,
  });

  const submitCampaign = (): void => {
    setFormError(null);
    setSubmitting(true);
    void (async () => {
      const res = await authorizedFetch("/campaigns/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSchedulePayload()),
      });
      setSubmitting(false);
      setConfirmOpen(false);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(err.error ?? `Schedule failed (${String(res.status)})`);
        return;
      }
      const result = (await res.json()) as { campaignId?: string };
      saveZoomDefaults(selectedProjectId, zoomFields);
      toast("Show Up campaign scheduled.");
      void vm.refreshMessages();
      navigate("/queue", {
        state: { expandCampaignId: result.campaignId ?? "" },
      });
    })();
  };

  const derivedPreview =
    webinarDate.length > 0
      ? `${customValues.workshopDay}, ${customValues.workshopDate} @ ${customValues.workshopTime} · Session ${customValues.sessionDate}`
      : null;

  return (
    <div className="space-y-6">
      <nav aria-label="Campaign wizard steps">
        <ol className="flex flex-wrap gap-2">
          {WIZARD_STEPS.map((label, idx) => {
            const num = idx + 1;
            const isActive = step === num;
            const isDone = step > num;
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => {
                    if (num < step) {
                      setStep(num);
                    }
                  }}
                  disabled={num > step}
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[44px]",
                    isActive && "border-primary bg-primary/10 text-primary",
                    isDone && "border-border text-muted-foreground",
                    !isActive && !isDone && "border-border text-muted-foreground opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[11px]",
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {String(num)}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {formError !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {hasPastSlots && webinarDate.length > 0 ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertDescription>
            Some slots are in the past and will be skipped.
          </AlertDescription>
        </Alert>
      ) : null}

      {step === 1 ? (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Campaign details</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Set the webinar date and time — day, session copy, and countdown text are filled in
                automatically. Update Zoom details each round.
              </p>
            </div>
            {sopUrl !== null && sopUrl.length > 0 ? (
              <a
                href={sopUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                Open SOP ↗
              </a>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="webinar-date">Webinar date</Label>
              <Input
                id="webinar-date"
                type="date"
                value={webinarDate}
                onChange={(e) => {
                  markDirty();
                  setWebinarDate(e.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-start">Event start time (MYT)</Label>
              <Input
                id="event-start"
                type="time"
                value={eventStartTimeMyt}
                onChange={(e) => {
                  markDirty();
                  setEventStartTimeMyt(e.target.value);
                }}
              />
            </div>
          </div>

          {derivedPreview !== null ? (
            <p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
              Templates will use: <strong>{derivedPreview}</strong>
            </p>
          ) : null}

          <Separator />

          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Zoom (changes each campaign)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="zoom-link">Zoom link</Label>
              <Input
                id="zoom-link"
                type="url"
                value={zoomFields.zoomLink}
                placeholder={ZOOM_FIELD_PLACEHOLDERS.zoomLink}
                onChange={(e) => updateZoomField("zoomLink", e.target.value)}
                maxLength={512}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zoom-id">Zoom meeting ID</Label>
              <Input
                id="zoom-id"
                value={zoomFields.zoomId}
                placeholder={ZOOM_FIELD_PLACEHOLDERS.zoomId}
                onChange={(e) => updateZoomField("zoomId", e.target.value)}
                maxLength={32}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zoom-passcode">Zoom passcode</Label>
              <Input
                id="zoom-passcode"
                value={zoomFields.zoomPasscode}
                placeholder={ZOOM_FIELD_PLACEHOLDERS.zoomPasscode}
                onChange={(e) => updateZoomField("zoomPasscode", e.target.value)}
                maxLength={16}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Value posts are scheduled separately under{" "}
            <strong>Single message</strong> — they fan out to all communities automatically.
          </p>

          {webinarDate.length > 0 && !isWebinarDateValid(webinarDate) ? (
            <p className="text-sm text-destructive">Webinar date must be today or in the future (MYT).</p>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold">Reminder destination</h2>
          <p className="text-sm text-muted-foreground">
            All Show Up reminders (Welcome through Sticker) go to this community channel.
          </p>
          <CommunityChannelPicker
            groups={vm.groups}
            groupJid={reminderGroupJid}
            waConnected={vm.waConnected}
            onGroupSelect={onReminderGroupSelect}
            idPrefix="campaign-reminder"
          />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold">Show Up review</h2>
          <p className="text-sm text-muted-foreground">
            Upload reminder images and sticker once per project in{" "}
            <Link to="/settings#reminder-templates" className="text-primary font-medium hover:underline">
              Settings → Reminder templates
            </Link>
            .
          </p>

          {templatesLoading ? (
            <p className="text-sm text-muted-foreground">Loading templates…</p>
          ) : templatesError !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{templatesError}</AlertDescription>
            </Alert>
          ) : templates.length === 0 ? (
            <Alert>
              <AlertDescription>
                No templates found.{" "}
                <Link to="/settings#reminder-templates" className="font-medium text-primary hover:underline">
                  Configure reminder templates in Settings
                </Link>{" "}
                first (Welcome image, countdown graphics, LIVE NOW text, sticker).
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Choose which reminders to schedule. Past slots and the post-live sticker (when no
                asset is uploaded) are unchecked automatically. Uncheck any future slot you already
                sent manually.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3">Schedule</th>
                      <th className="py-2 pr-3">Slot</th>
                      <th className="py-2 pr-3">Send time (MYT)</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Asset</th>
                      <th className="py-2">Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((t) => {
                      const slotTime = showUpSlots.find((s) => s.slotKey === t.slotKey);
                      const classified = classifiedSlots.find((s) => s.slotKey === t.slotKey);
                      const hasAsset = templateHasRequiredAssets(t);
                      const isOptionalSticker = t.reminderFormat === "STICKER";
                      const preview = mergePreviewForSlot(t, customValues);
                      const isScheduled = classified?.status === "scheduled";
                      const isToggleable = schedulableSlotKeys.includes(t.slotKey);
                      const isChecked = isToggleable && selectedSlotKeys.has(t.slotKey);
                      return (
                        <tr key={t.slotKey} className="border-b last:border-0">
                          <td className="py-3 pr-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!isToggleable}
                                aria-label={`Schedule ${REMINDER_SLOT_LABELS[t.slotKey] ?? t.name}`}
                                onChange={(e) => toggleSlotSelection(t.slotKey, e.target.checked)}
                              />
                              <span className="text-xs text-muted-foreground sr-only sm:not-sr-only">
                                {isToggleable ? "Schedule" : "—"}
                              </span>
                            </label>
                          </td>
                          <td className="py-3 pr-3 font-medium">
                            {REMINDER_SLOT_LABELS[t.slotKey] ?? t.name}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            {slotTime !== undefined ? formatUtcIsoMyt(slotTime.scheduledAt) : "—"}
                          </td>
                          <td className="py-3 pr-3">
                            {classified !== undefined ? (
                              <Badge
                                variant={isScheduled ? "outline" : "secondary"}
                                className={cn(
                                  "text-xs font-normal",
                                  isScheduled && "text-green-700 border-green-300",
                                )}
                              >
                                {classified.statusLabel}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-3 pr-3">
                            {hasAsset ? (
                              <Badge variant="outline" className="text-green-700 border-green-300">
                                ✓
                              </Badge>
                            ) : isOptionalSticker ? (
                              <Badge variant="secondary" className="text-xs font-normal">
                                Skipped — no sticker yet
                              </Badge>
                            ) : (
                              <Link
                                to="/settings#reminder-templates"
                                className="text-destructive text-xs font-medium hover:underline"
                              >
                                Missing — upload in Settings
                              </Link>
                            )}
                          </td>
                          <td className="py-3">
                            <div className="flex items-start gap-2 max-w-md">
                              {isOptionalSticker && !hasAsset ? (
                                <span className="text-xs text-muted-foreground">
                                  Not scheduled until you upload a WebP in Settings.
                                </span>
                              ) : (
                                <>
                                  <TemplatePreviewThumb
                                    template={t}
                                    authorizedFetch={authorizedFetch}
                                  />
                                  {preview.ok && preview.text.length > 0 ? (
                                    <p className="text-xs text-muted-foreground line-clamp-3">
                                      {preview.text}
                                    </p>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {scheduledReminderCount === 0 ? (
                <p className="text-sm text-destructive">
                  No reminder slots selected — at least one future slot must be scheduled.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold">Confirm campaign</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Webinar</dt>
              <dd className="font-medium">
                {webinarDate} @ {eventStartTimeMyt} MYT
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reminders to</dt>
              <dd className="font-medium">{reminderGroupName || "—"}</dd>
            </div>
          </dl>

          <p className="text-sm text-muted-foreground">
            Adjust which reminders to schedule before confirming. Uncheck slots you already sent
            manually.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-2">Schedule</th>
                  <th className="py-2 pr-2">Slot</th>
                  <th className="py-2 pr-2">Time</th>
                  <th className="py-2 pr-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {classifiedSlots.map((s) => {
                  const isToggleable = schedulableSlotKeys.includes(s.slotKey);
                  const isChecked = isToggleable && selectedSlotKeys.has(s.slotKey);
                  return (
                    <tr key={s.slotKey} className="border-b">
                      <td className="py-2 pr-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isToggleable}
                            aria-label={`Schedule ${REMINDER_SLOT_LABELS[s.slotKey] ?? s.slotKey}`}
                            onChange={(e) => toggleSlotSelection(s.slotKey, e.target.checked)}
                          />
                        </label>
                      </td>
                      <td className="py-2 pr-2">{REMINDER_SLOT_LABELS[s.slotKey] ?? s.slotKey}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">{formatUtcIsoMyt(s.scheduledAt)}</td>
                      <td className="py-2 pr-2">
                        <Badge
                          variant={s.status === "scheduled" ? "outline" : "secondary"}
                          className={cn(
                            "text-xs font-normal",
                            s.status === "scheduled" && "text-green-700 border-green-300",
                          )}
                        >
                          {s.statusLabel}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-sm font-medium">
            Scheduling <strong>{String(scheduledReminderCount)}</strong> reminders
            {skippedReminderCount > 0 ? (
              <>
                {" "}
                (<strong>{String(skippedReminderCount)}</strong> skipped)
              </>
            ) : null}
          </p>

          {scheduledReminderCount === 0 ? (
            <p className="text-sm text-destructive">
              No reminder slots selected — at least one future slot must be scheduled.
            </p>
          ) : null}

          <Button
            type="button"
            disabled={submitting || !vm.waConnected || !step3Valid}
            className="w-full sm:w-auto"
            onClick={() => setConfirmOpen(true)}
          >
            Schedule Show Up campaign
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={step <= 1}
          className="w-full sm:w-auto min-h-[44px]"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
        >
          Back
        </Button>
        {step < 4 ? (
          <Button
            type="button"
            disabled={!stepValid}
            className="w-full sm:w-auto min-h-[44px]"
            onClick={() => {
              setFormError(null);
              setStep((s) => Math.min(4, s + 1));
            }}
          >
            Next
          </Button>
        ) : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Show Up campaign?</DialogTitle>
            <DialogDescription>
              Schedule <strong>{String(scheduledReminderCount)}</strong> reminders
              {skippedReminderCount > 0 ? (
                <>
                  {" "}
                  (<strong>{String(skippedReminderCount)}</strong> skipped)
                </>
              ) : null}{" "}
              to <strong>{reminderGroupName}</strong>?
              {skippedReminderCount > 0 ? (
                <>
                  {" "}
                  Skipped slots:{" "}
                  {classifiedSlots
                    .filter((s) => s.status !== "scheduled")
                    .map((s) => `${REMINDER_SLOT_LABELS[s.slotKey] ?? s.slotKey} (${s.statusLabel})`)
                    .join(", ")}
                  .
                </>
              ) : null}{" "}
              Cancel individual rows from the Queue later if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting || scheduledReminderCount === 0}
              onClick={() => submitCampaign()}
            >
              {submitting ? "Scheduling…" : "Confirm schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
