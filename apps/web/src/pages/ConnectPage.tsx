/**
 * WhatsApp — linking and API diagnostics.
 */

import { useEffect, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNmcasVm } from "../context/NmcasVmContext.js";
import { PageHeader } from "../components/PageHeader.js";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel.js";
import { WhatsAppSection } from "../components/WhatsAppSection.js";

function WhatsAppPrerequisiteMessage(): ReactElement {
  const vm = useNmcasVm();

  if (vm.projectsLoading) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        </CardContent>
      </Card>
    );
  }

  if (vm.projectsError !== null) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-col gap-3">
          <p>Could not load projects: {vm.projectsError}</p>
          <Button size="sm" variant="outline" onClick={() => void vm.loadProjects()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (vm.projects.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Create a project before linking WhatsApp. Each project has its own WhatsApp session.
          </p>
          <Button asChild size="sm">
            <Link to="/settings">Go to Settings</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (vm.selectedProjectId.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">
            Select a project in the header to link WhatsApp.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">Sign in and select a project to link WhatsApp.</p>
      </CardContent>
    </Card>
  );
}

export function ConnectPage(): ReactElement {
  const vm = useNmcasVm();

  useEffect(() => {
    document.title = "WhatsApp · NMCAS";
  }, []);

  return (
    <div className="page-stack">
      <PageHeader
        title="WhatsApp"
        description="Link this project's WhatsApp account by scanning a QR code. Each project has its own WhatsApp session."
      />
      {vm.canUseApiRoutes ? <WhatsAppSection vm={vm} /> : <WhatsAppPrerequisiteMessage />}
      <DiagnosticsPanel vm={vm} />
    </div>
  );
}
