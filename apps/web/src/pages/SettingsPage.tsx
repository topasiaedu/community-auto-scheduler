/**
 * Settings — active workspace, project management, and session (sign-out).
 * Uses shadcn Card, Input, Textarea, Button, Label, Separator.
 */

import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNmcasVm } from "../context/NmcasVmContext.js";
import { PageHeader } from "../components/PageHeader.js";

export function SettingsPage(): ReactElement {
  const vm = useNmcasVm();
  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    document.title = "Settings · NMCAS";
  }, []);

  const {
    session,
    projects,
    projectsLoading,
    projectsError,
    selectedProjectId,
    setSelectedProjectId,
    selectedProjectName,
    newProjectName,
    setNewProjectName,
    newProjectDescription,
    setNewProjectDescription,
    createProjectSubmitting,
    createProjectError,
    onCreateProject,
    onSignOut,
  } = vm;

  const handleCreateProject = (ev: FormEvent) => {
    onCreateProject(ev);
    setShowNewProject(false);
  };

  return (
    <div className="page-stack">
      <PageHeader title="Settings" description="Switch workspace, manage projects, and sign out." />

      {/* Active workspace */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active workspace</CardTitle>
          <CardDescription>All sends and WhatsApp connections are per-project.</CardDescription>
        </CardHeader>
        <CardContent>
          {projectsLoading ? (
            <p className="text-sm text-muted-foreground">Loading projects…</p>
          ) : projectsError !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{projectsError}</AlertDescription>
            </Alert>
          ) : projects.length === 0 ? (
            <p className="text-sm text-amber-700">
              No projects yet. Create one below, or run <code className="font-mono text-xs">npm run db:seed</code>.
            </p>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="active-project">Project</Label>
              <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v)}>
                <SelectTrigger id="active-project" className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-md px-3 py-2 max-w-xs">
                You are scheduling for <strong>{selectedProjectName}</strong>. Each project has its own
                WhatsApp session — switch before composing if you manage multiple accounts.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Projects list */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base">Projects</CardTitle>
            <CardDescription className="mt-1">All workspaces you manage.</CardDescription>
          </div>
          {!showNewProject ? (
            <Button variant="outline" size="sm" onClick={() => setShowNewProject(true)}>
              + New project
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {projects.length > 0 ? (
            <div className="rounded-md border border-border overflow-hidden">
              {projects.map((p, idx) => (
                <div key={p.id}>
                  <div className="flex items-baseline gap-3 px-4 py-3 bg-card">
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.description !== null && p.description.length > 0 ? (
                      <span className="text-xs text-muted-foreground">{p.description}</span>
                    ) : null}
                  </div>
                  {idx < projects.length - 1 ? <Separator /> : null}
                </div>
              ))}
            </div>
          ) : null}

          {showNewProject ? (
            <form onSubmit={handleCreateProject} className="space-y-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Creates a new WhatsApp workspace. Link it from Connect after switching.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="new-proj-name">Name</Label>
                <Input
                  id="new-proj-name"
                  value={newProjectName}
                  maxLength={256}
                  placeholder="My Community"
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-proj-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  id="new-proj-desc"
                  value={newProjectDescription}
                  maxLength={2000}
                  rows={2}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              {createProjectError !== null ? (
                <Alert variant="destructive">
                  <AlertDescription>{createProjectError}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={createProjectSubmitting}>
                  {createProjectSubmitting ? "Creating…" : "Create project"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewProject(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {/* Session */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signed in as</p>
              <p className="mt-1 font-medium text-sm break-all">
                {session?.user.email ?? session?.user.id ?? "—"}
              </p>
            </div>
            <Button variant="outline" onClick={() => void onSignOut()}>
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
