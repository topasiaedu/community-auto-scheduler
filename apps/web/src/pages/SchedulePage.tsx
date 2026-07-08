/**
 * Schedule — campaign wizard or single-message compose (P7 Phase 5b).
 */

import { useEffect, useState, type ReactElement } from "react";
import { useNmcasVm } from "../context/NmcasVmContext.js";
import { PageHeader } from "../components/PageHeader.js";
import { ScheduleModeControl } from "../components/schedule/ScheduleModeControl.js";
import { CampaignWizard } from "../components/schedule/CampaignWizard.js";
import { SingleMessageSection } from "../components/schedule/SingleMessageSection.js";
import {
  readScheduleMode,
  writeScheduleMode,
  type SchedulePageMode,
} from "../lib/scheduleMode.js";

export function SchedulePage(): ReactElement {
  const vm = useNmcasVm();
  const [mode, setMode] = useState<SchedulePageMode>(() => readScheduleMode());

  useEffect(() => {
    document.title = "Schedule · NMCAS";
  }, []);

  const onModeChange = (next: SchedulePageMode): void => {
    setMode(next);
    writeScheduleMode(next);
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Schedule"
        description="Run a full campaign rhythm or schedule a one-off Value or Reminder message."
      />

      <ScheduleModeControl value={mode} onChange={onModeChange} />

      {mode === "campaign" ? <CampaignWizard vm={vm} /> : <SingleMessageSection vm={vm} />}
    </div>
  );
}
