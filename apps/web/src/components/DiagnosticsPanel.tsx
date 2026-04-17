/**
 * Collapsible API health diagnostics (signed-in only).
 */

import type { ReactElement } from "react";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";

type DiagnosticsPanelProps = {
  vm: NmcasViewModel;
};

export function DiagnosticsPanel({ vm }: DiagnosticsPanelProps): ReactElement | null {
  const { session, health, refreshHealth } = vm;

  if (session === null) {
    return null;
  }

  return (
    <details className="details-diag">
      <summary>Diagnostics</summary>
      <div className="diag-inner">
        {health === null ? (
          <p>API health could not be loaded.</p>
        ) : (
          <>
            <p>
              <strong>API:</strong> OK
            </p>
            <p>
              <strong>Queue:</strong> <code>{health.queue}</code>
            </p>
            <p>
              <strong>Session path example:</strong> <code>{health.sessionPathExample}</code>
            </p>
          </>
        )}
        <p className="btn-row">
          <button type="button" className="btn btn--ghost" onClick={() => void refreshHealth()}>
            Refresh health
          </button>
        </p>
      </div>
    </details>
  );
}
