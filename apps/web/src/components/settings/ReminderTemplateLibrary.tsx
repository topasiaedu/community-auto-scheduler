/**
 * Reminder template library — six SOP slots in an accordion (#reminder-templates).
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import type { Session } from "@supabase/supabase-js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuthorizedFetch } from "../../hooks/useAuthorizedFetch.js";
import type { ReminderTemplateRow } from "../../types/models.js";
import { ReminderTemplateSlotPanel } from "./ReminderTemplateSlotPanel.js";

const SLOT_ORDER = [
  "welcome",
  "countdown_2d",
  "countdown_1d",
  "starting_soon",
  "live_now",
  "post_live_sticker",
] as const;

function slotHasRequiredAsset(template: ReminderTemplateRow): boolean {
  if (template.reminderFormat === "IMAGE") {
    return template.mediaUrl !== null && template.mediaUrl.length > 0;
  }
  if (template.reminderFormat === "TEXT") {
    return template.bodyTemplate !== null && template.bodyTemplate.trim().length > 0;
  }
  if (template.reminderFormat === "STICKER") {
    return template.stickerUrl !== null && template.stickerUrl.length > 0;
  }
  return false;
}

function isOptionalSlot(template: ReminderTemplateRow): boolean {
  return template.reminderFormat === "STICKER" || template.slotKey === "post_live_sticker";
}

/** Required slots must be configured; sticker is optional. */
function campaignReady(templates: ReminderTemplateRow[]): boolean {
  const required = templates.filter((t) => !isOptionalSlot(t));
  return required.length > 0 && required.every(slotHasRequiredAsset);
}

type ReminderTemplateLibraryProps = {
  session: Session | null;
  projectId: string;
};

export function ReminderTemplateLibrary({
  session,
  projectId,
}: ReminderTemplateLibraryProps): ReactElement {
  const authorizedFetch = useAuthorizedFetch(session, projectId);
  const [templates, setTemplates] = useState<ReminderTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    if (session === null || projectId.length === 0) {
      setTemplates([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authorizedFetch("/templates");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Failed to load templates (${String(res.status)})`);
        setTemplates([]);
        return;
      }
      const json = (await res.json()) as { templates?: ReminderTemplateRow[] };
      const list = Array.isArray(json.templates) ? json.templates : [];
      setTemplates(list);
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, session, projectId]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const orderedTemplates = useMemo(() => {
    const byKey = new Map(templates.map((t) => [t.slotKey, t]));
    return SLOT_ORDER.map((key) => byKey.get(key)).filter(
      (t): t is ReminderTemplateRow => t !== undefined,
    );
  }, [templates]);

  const ready = campaignReady(orderedTemplates);
  const requiredCount = orderedTemplates.filter((t) => !isOptionalSlot(t)).length;
  const requiredConfigured = orderedTemplates.filter(
    (t) => !isOptionalSlot(t) && slotHasRequiredAsset(t),
  ).length;

  const onTemplateSaved = (updated: ReminderTemplateRow) => {
    setTemplates((prev) =>
      prev.map((t) => (t.slotKey === updated.slotKey ? updated : t)),
    );
  };

  if (projectId.length === 0) {
    return (
      <Card id="reminder-templates">
        <CardHeader>
          <CardTitle className="text-base">Reminder template library</CardTitle>
          <CardDescription>Select a project to configure Show Up reminder templates.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id="reminder-templates">
      <CardHeader>
        <CardTitle className="text-base">Reminder template library</CardTitle>
        <CardDescription>
          Upload SOP images once per project. Post-live sticker is optional until you have a WebP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ready && !loading ? (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border bg-muted/30 px-4 py-3">
            Upload Welcome, countdown, and Starting Soon images (and keep LIVE NOW text) before your
            first campaign. Sticker can wait.
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading templates…</p>
        ) : null}

        {error !== null ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!loading && orderedTemplates.length > 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {String(requiredConfigured)} of {String(requiredCount)} required slots configured
            </span>
            {ready ? (
              <Badge variant="outline" className="border-green-300 bg-green-50 text-green-800">
                Ready for campaigns
              </Badge>
            ) : null}
          </div>
        ) : null}

        {!loading && orderedTemplates.length > 0 ? (
          <Accordion type="multiple">
            {orderedTemplates.map((template) => (
              <AccordionItem key={template.slotKey} value={template.slotKey}>
                <AccordionTrigger value={template.slotKey}>
                  <span className="flex items-center gap-2">
                    <span>{template.name}</span>
                    {slotHasRequiredAsset(template) ? (
                      <Badge variant="outline" className="font-normal">
                        Configured
                      </Badge>
                    ) : isOptionalSlot(template) ? (
                      <Badge variant="secondary" className="font-normal">
                        Optional
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="font-normal">
                        Missing asset
                      </Badge>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent value={template.slotKey}>
                  <ReminderTemplateSlotPanel
                    session={session}
                    projectId={projectId}
                    template={template}
                    onSaved={onTemplateSaved}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : null}
      </CardContent>
    </Card>
  );
}
