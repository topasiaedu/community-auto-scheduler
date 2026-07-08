/**
 * Single reminder template slot editor (asset, body, save, preview).
 */

import { useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthorizedFetch } from "../../hooks/useAuthorizedFetch.js";
import { formatScheduleRuleLabel } from "../../lib/scheduleRuleLabel.js";
import type { ReminderTemplateRow } from "../../types/models.js";
import { MediaDropZone } from "./MediaDropZone.js";
import { MergePreviewDialog } from "./MergePreviewDialog.js";

type ReminderTemplateSlotPanelProps = {
  session: Session | null;
  projectId: string;
  template: ReminderTemplateRow;
  onSaved: (template: ReminderTemplateRow) => void;
};

function formatBadgeLabel(format: ReminderTemplateRow["reminderFormat"]): string {
  switch (format) {
    case "IMAGE":
      return "Image + caption";
    case "TEXT":
      return "Text only";
    case "STICKER":
      return "Sticker";
  }
}

export function ReminderTemplateSlotPanel({
  session,
  projectId,
  template,
  onSaved,
}: ReminderTemplateSlotPanelProps): ReactElement {
  const authorizedFetch = useAuthorizedFetch(session, projectId);
  const [bodyTemplate, setBodyTemplate] = useState(template.bodyTemplate ?? "");
  const [mediaUrl, setMediaUrl] = useState<string | null>(template.mediaUrl);
  const [stickerUrl, setStickerUrl] = useState<string | null>(template.stickerUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const assetPath =
    template.reminderFormat === "STICKER" ? stickerUrl : mediaUrl;

  useEffect(() => {
    setBodyTemplate(template.bodyTemplate ?? "");
    setMediaUrl(template.mediaUrl);
    setStickerUrl(template.stickerUrl);
    setDirty(false);
    setError(null);
  }, [
    template.slotKey,
    template.bodyTemplate,
    template.mediaUrl,
    template.stickerUrl,
  ]);

  useEffect(() => {
    if (assetPath === null || assetPath.length === 0) {
      setPreviewUrl((prev) => {
        if (prev !== null) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await authorizedFetch(`/uploads/media?path=${encodeURIComponent(assetPath)}`);
      if (!res.ok || cancelled) {
        return;
      }
      const blob = await res.blob();
      if (cancelled) {
        return;
      }
      const next = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev !== null) {
          URL.revokeObjectURL(prev);
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [assetPath, authorizedFetch]);

  const uploadAsset = (file: File | undefined) => {
    if (file === undefined || session === null || projectId.length === 0) {
      return;
    }
    setError(null);
    setUploading(true);

    const kind =
      template.reminderFormat === "STICKER" ? "sticker" : "reminder-image";

    void (async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authorizedFetch(`/uploads/media?kind=${kind}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(err.error ?? `Upload failed (${String(res.status)})`);
        setUploading(false);
        return;
      }
      const json = (await res.json()) as { path?: string };
      if (typeof json.path !== "string" || json.path.length === 0) {
        setError("Upload succeeded but path was missing.");
        setUploading(false);
        return;
      }
      if (template.reminderFormat === "STICKER") {
        setStickerUrl(json.path);
      } else {
        setMediaUrl(json.path);
      }
      setDirty(true);
      setUploading(false);
    })();
  };

  const removeAsset = () => {
    if (template.reminderFormat === "STICKER") {
      setStickerUrl(null);
    } else {
      setMediaUrl(null);
    }
    setDirty(true);
  };

  const onSave = () => {
    if (session === null || projectId.length === 0) {
      return;
    }
    setSaving(true);
    setError(null);

    const patchBody: {
      mediaUrl?: string;
      stickerUrl?: string;
      bodyTemplate?: string;
    } = {};

    if (template.reminderFormat === "IMAGE") {
      if (mediaUrl !== null && mediaUrl.length > 0) {
        patchBody.mediaUrl = mediaUrl;
      }
      patchBody.bodyTemplate = bodyTemplate;
    } else if (template.reminderFormat === "TEXT") {
      patchBody.bodyTemplate = bodyTemplate;
    } else if (template.reminderFormat === "STICKER") {
      if (stickerUrl !== null && stickerUrl.length > 0) {
        patchBody.stickerUrl = stickerUrl;
      }
    }

    void (async () => {
      const res = await authorizedFetch(`/templates/${template.slotKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(err.error ?? `Save failed (${String(res.status)})`);
        setSaving(false);
        return;
      }
      const json = (await res.json()) as { template?: ReminderTemplateRow };
      if (json.template !== undefined) {
        onSaved(json.template);
        setBodyTemplate(json.template.bodyTemplate ?? "");
        setMediaUrl(json.template.mediaUrl);
        setStickerUrl(json.template.stickerUrl);
      }
      setDirty(false);
      setSaving(false);
      toast.success(`${template.name} template saved`);
    })();
  };

  const showBodyEditor = template.reminderFormat !== "STICKER";
  const canPreviewMerge =
    showBodyEditor && bodyTemplate.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{formatBadgeLabel(template.reminderFormat)}</Badge>
        <p className="text-sm text-muted-foreground">{formatScheduleRuleLabel(template)}</p>
      </div>

      {template.reminderFormat !== "TEXT" ? (
        <div className="space-y-2">
          <Label>
            {template.reminderFormat === "STICKER" ? "Sticker asset" : "Image asset"}
          </Label>
          <MediaDropZone
            assetPath={assetPath}
            accept={template.reminderFormat === "STICKER" ? "image/webp,.webp" : "image/*"}
            hint={
              template.reminderFormat === "STICKER"
                ? "Static WebP only — animated stickers are rejected"
                : "JPEG, PNG, or WebP"
            }
            uploading={uploading}
            disabled={session === null}
            onUpload={uploadAsset}
            onRemove={removeAsset}
          />
          {previewUrl !== null ? (
            <div
              className={
                template.reminderFormat === "STICKER"
                  ? "sticker-preview-bg inline-flex max-w-xs rounded-md p-3"
                  : "max-w-xs overflow-hidden rounded-md border border-border"
              }
            >
              <img
                src={previewUrl}
                alt={`${template.name} preview`}
                className={
                  template.reminderFormat === "STICKER"
                    ? "max-h-32 w-auto object-contain"
                    : "h-auto w-full object-cover"
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {showBodyEditor ? (
        <div className="space-y-1.5">
          <Label htmlFor={`body-template-${template.slotKey}`}>Message template</Label>
          <Textarea
            id={`body-template-${template.slotKey}`}
            rows={8}
            value={bodyTemplate}
            disabled={session === null}
            onChange={(e) => {
              setBodyTemplate(e.target.value);
              setDirty(true);
            }}
            placeholder="Use {{workshopDay}}, {{zoomLink}}, etc."
            className="font-mono text-sm max-w-2xl"
          />
          <p className="text-xs text-muted-foreground">
            Placeholders: {"{{workshopDay}}"}, {"{{workshopDate}}"}, {"{{workshopTime}}"},
            {" {{zoomLink}}"}, {"{{sessionDate}}"}, {"{{sessionTime}}"}, {"{{zoomId}}"},
            {" {{zoomPasscode}}"}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sticker slots send the asset only — no caption template.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canPreviewMerge ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            Preview merge
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={saving || !dirty || session === null}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save template"}
        </Button>
      </div>

      {error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {canPreviewMerge ? (
        <MergePreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          slotName={template.name}
          bodyTemplate={bodyTemplate}
        />
      ) : null}
    </div>
  );
}
