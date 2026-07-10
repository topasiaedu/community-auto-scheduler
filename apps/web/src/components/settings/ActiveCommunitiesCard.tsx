/**
 * Active communities card — which communities receive Value post fan-out.
 */

import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuthorizedFetch } from "../../hooks/useAuthorizedFetch.js";
import type { ProjectRow, WaGroup } from "../../types/models.js";

type ActiveCommunityOption = {
  communityJid: string;
  label: string;
};

function buildActiveCommunityOptions(groups: readonly WaGroup[]): ActiveCommunityOption[] {
  const seen = new Set<string>();
  const out: ActiveCommunityOption[] = [];
  for (const g of groups) {
    const communityJid = g.communityJid?.trim();
    if (communityJid === undefined || communityJid.length === 0 || seen.has(communityJid)) {
      continue;
    }
    seen.add(communityJid);
    const label =
      g.communityName !== undefined && g.communityName.trim().length > 0
        ? g.communityName.trim()
        : g.name;
    out.push({ communityJid, label });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

function initialSelectedJids(
  projectJids: string[] | null | undefined,
  options: readonly ActiveCommunityOption[],
): Set<string> {
  if (projectJids === null || projectJids === undefined || projectJids.length === 0) {
    return new Set(options.map((o) => o.communityJid));
  }
  return new Set(projectJids);
}

type ActiveCommunitiesCardProps = {
  session: Session | null;
  project: ProjectRow | undefined;
  waConnected: boolean;
  groups: readonly WaGroup[];
  onSaved?: () => void;
};

export function ActiveCommunitiesCard({
  session,
  project,
  waConnected,
  groups,
  onSaved,
}: ActiveCommunitiesCardProps): ReactElement {
  const authorizedFetch = useAuthorizedFetch(session, project?.id ?? "");
  const communityOptions = useMemo(() => buildActiveCommunityOptions(groups), [groups]);
  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSelectedJids(initialSelectedJids(project?.activeCommunityJids, communityOptions));
    setDirty(false);
    setError(null);
  }, [project?.id, project?.activeCommunityJids, communityOptions]);

  const toggleJid = (communityJid: string, checked: boolean): void => {
    setSelectedJids((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(communityJid);
      } else {
        next.delete(communityJid);
      }
      return next;
    });
    setDirty(true);
  };

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (project === undefined || session === null) {
      return;
    }
    setSaving(true);
    setError(null);
    void (async () => {
      const allSelected =
        communityOptions.length > 0 &&
        communityOptions.every((o) => selectedJids.has(o.communityJid));
      const body: { activeCommunityJids: string[] | null } = {
        activeCommunityJids: allSelected ? null : [...selectedJids],
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
      setDirty(false);
      setSaving(false);
      toast.success("Active communities saved");
      onSaved?.();
    })();
  };

  if (project === undefined) {
    return (
      <Card id="active-communities">
        <CardHeader>
          <CardTitle className="text-base">Active communities</CardTitle>
          <CardDescription>Select a project to configure Value post fan-out destinations.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id="active-communities">
      <CardHeader>
        <CardTitle className="text-base">Active communities</CardTitle>
        <CardDescription>
          Value posts scheduled in Single message mode will be sent to Announcements in each active
          community ({project.name}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!waConnected ? (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <AlertDescription className="text-sm">
              Connect WhatsApp to list communities.{" "}
              <Link to="/whatsapp" className="font-semibold text-primary underline underline-offset-2">
                Link your account →
              </Link>
            </AlertDescription>
          </Alert>
        ) : communityOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No linked communities found. Ensure your WhatsApp account has communities with
            Announcements channels.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 max-w-lg">
            <div className="space-y-3">
              {communityOptions.map((option) => {
                const checked = selectedJids.has(option.communityJid);
                const inputId = `active-community-${option.communityJid}`;
                return (
                  <div key={option.communityJid} className="flex items-center gap-3">
                    <input
                      id={inputId}
                      type="checkbox"
                      className="h-4 w-4 rounded border border-border"
                      checked={checked}
                      onChange={(e) => toggleJid(option.communityJid, e.target.checked)}
                    />
                    <Label htmlFor={inputId} className="text-sm font-normal cursor-pointer">
                      {option.label}
                    </Label>
                  </div>
                );
              })}
            </div>

            {error !== null ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="sm" disabled={saving || !dirty || selectedJids.size === 0}>
              {saving ? "Saving…" : "Save active communities"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
