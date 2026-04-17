/**
 * Connect — WhatsApp linking and API diagnostics.
 */

import { useEffect, type ReactElement } from "react";
import { useNmcasVm } from "../context/NmcasVmContext.js";
import { PageHeader } from "../components/PageHeader.js";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel.js";
import { WhatsAppSection } from "../components/WhatsAppSection.js";

export function ConnectPage(): ReactElement {
  const vm = useNmcasVm();

  useEffect(() => {
    document.title = "Connect · NMCAS";
  }, []);

  return (
    <div className="page-stack">
      <PageHeader
        title="Connect"
        description="Link this project's WhatsApp account by scanning a QR code. Each project has its own WhatsApp session."
      />
      <WhatsAppSection vm={vm} />
      <DiagnosticsPanel vm={vm} />
    </div>
  );
}
