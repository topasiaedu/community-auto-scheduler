/**
 * Merge preview dialog — editable sample Custom Values and rendered body output.
 */

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hasUnresolvedPlaceholders, mergeTemplate } from "../../lib/mergeTemplate.js";
import { SAMPLE_CUSTOM_VALUES } from "../../lib/sampleCustomValues.js";
import type { CampaignCustomValues } from "../../types/models.js";

const CUSTOM_VALUE_FIELDS: { key: keyof CampaignCustomValues; label: string }[] = [
  { key: "workshopDay", label: "Workshop day" },
  { key: "workshopDate", label: "Workshop date" },
  { key: "workshopTime", label: "Workshop time" },
  { key: "zoomLink", label: "Zoom link" },
  { key: "sessionDate", label: "Session date" },
  { key: "sessionTime", label: "Session time" },
  { key: "zoomId", label: "Zoom ID" },
  { key: "zoomPasscode", label: "Zoom passcode" },
];

type MergePreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slotName: string;
  bodyTemplate: string;
};

export function MergePreviewDialog({
  open,
  onOpenChange,
  slotName,
  bodyTemplate,
}: MergePreviewDialogProps): ReactElement {
  const [customValues, setCustomValues] = useState<CampaignCustomValues>(SAMPLE_CUSTOM_VALUES);

  useEffect(() => {
    if (open) {
      setCustomValues(SAMPLE_CUSTOM_VALUES);
    }
  }, [open]);

  const merged = useMemo(
    () => mergeTemplate(customValues, bodyTemplate),
    [customValues, bodyTemplate],
  );
  const unresolved = hasUnresolvedPlaceholders(merged);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Preview merge — {slotName}</DialogTitle>
          <DialogDescription>
            Edit sample Custom Values to see how placeholders resolve in this template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {CUSTOM_VALUE_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`merge-preview-${field.key}`}>{field.label}</Label>
                <Input
                  id={`merge-preview-${field.key}`}
                  value={customValues[field.key]}
                  onChange={(e) =>
                    setCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="merge-preview-output">Merged output</Label>
            <Textarea
              id="merge-preview-output"
              readOnly
              rows={8}
              value={merged}
              className="font-mono text-sm"
            />
            {unresolved ? (
              <p className="text-xs text-amber-700">
                Some placeholders are still unresolved after merge.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
