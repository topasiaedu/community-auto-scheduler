/**
 * Project links card — SOP URL and campaign note wired to PATCH /projects/:id.
 */

import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthorizedFetch } from "../../hooks/useAuthorizedFetch.js";
import type { ProjectRow } from "../../types/models.js";

type ProjectLinksCardProps = {
  session: Session | null;
  project: ProjectRow | undefined;
  onSaved?: () => void;
};

export function ProjectLinksCard({ session, project, onSaved }: ProjectLinksCardProps): ReactElement {
  const authorizedFetch = useAuthorizedFetch(session, project?.id ?? "");
  const [sopUrl, setSopUrl] = useState("");
  const [campaignNote, setCampaignNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSopUrl(project?.sopUrl ?? "");
    setCampaignNote(project?.campaignNote ?? "");
    setDirty(false);
    setError(null);
  }, [project?.id, project?.sopUrl, project?.campaignNote]);

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (project === undefined || session === null) {
      return;
    }
    setSaving(true);
    setError(null);
    void (async () => {
      const body: { sopUrl: string | null; campaignNote: string | null } = {
        sopUrl: sopUrl.trim().length > 0 ? sopUrl.trim() : null,
        campaignNote: campaignNote.trim().length > 0 ? campaignNote.trim() : null,
      };
      const res = await authorizedFetch(`/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(err.error ?? `Save failed (${String(res.status)})`);
        setSaving(false);
        return;
      }
      const json = (await res.json()) as { project?: ProjectRow };
      if (json.project !== undefined) {
        setSopUrl(json.project.sopUrl ?? "");
        setCampaignNote(json.project.campaignNote ?? "");
      }
      setDirty(false);
      setSaving(false);
      toast.success("Project links saved");
      onSaved?.();
    })();
  };

  if (project === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project links</CardTitle>
          <CardDescription>Select a project to configure SOP URL and campaign note.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Project links</CardTitle>
        <CardDescription>
          Optional links and internal notes for the active workspace ({project.name}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="sop-url">SOP URL</Label>
            <Input
              id="sop-url"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={sopUrl}
              maxLength={2048}
              onChange={(e) => {
                setSopUrl(e.target.value);
                setDirty(true);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Shown as &quot;Open SOP ↗&quot; on the Schedule campaign step when set.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="campaign-note">Campaign note</Label>
            <Textarea
              id="campaign-note"
              rows={3}
              maxLength={4000}
              placeholder="Internal note for your team…"
              value={campaignNote}
              onChange={(e) => {
                setCampaignNote(e.target.value);
                setDirty(true);
              }}
            />
            <p className="text-xs text-muted-foreground">Internal only — not sent to WhatsApp.</p>
          </div>

          {error !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" size="sm" disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save project links"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
