/**
 * Compose — create a new scheduled post or poll.
 * Two-column layout on wide screens: form left, live preview right.
 */

import { useEffect, type ReactElement } from "react";
import { useNmcasVm } from "../context/NmcasVmContext.js";
import { PageHeader } from "../components/PageHeader.js";
import { ScheduleFormSection } from "../components/ScheduleFormSection.js";
import { MessagePreview } from "../components/MessagePreview.js";

export function ComposePage(): ReactElement {
  const vm = useNmcasVm();

  useEffect(() => {
    document.title = "Compose · NMCAS";
  }, []);

  return (
    <div className="page-stack">
      <PageHeader
        title="Compose"
        description="Pick a group, write your message, and schedule it in Malaysia Time (MYT)."
      />

      <div className="compose-layout">
        <div className="compose-layout__form">
          <ScheduleFormSection vm={vm} />
        </div>
        <div className="compose-layout__preview">
          <MessagePreview
            kind={vm.messageKind}
            groupTitle={vm.groupPickerLabel}
            copyText={vm.copyText}
            pollQuestion={vm.pollQuestion}
            pollOptions={vm.pollOptions}
            pollMultiSelect={vm.pollMultiSelect}
            imageSrc={vm.composeImageDisplayUrl}
            scheduledLocal={vm.scheduledLocal}
          />
        </div>
      </div>
    </div>
  );
}
