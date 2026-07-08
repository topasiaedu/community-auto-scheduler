/**
 * Reusable Community → Channel picker for Schedule flows.
 */

import { useMemo, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  buildWaCommunityPickerOptions,
  formatWaGroupPickerLabel,
  waGroupChannelLabel,
  waGroupCommunityKey,
  waGroupIsStandaloneDestination,
} from "../../lib/format.js";
import type { WaGroup } from "../../types/models.js";

type CommunityChannelPickerProps = {
  groups: readonly WaGroup[];
  groupJid: string;
  waConnected: boolean;
  onGroupSelect: (jid: string) => void;
  helperText?: string;
  idPrefix?: string;
};

export function CommunityChannelPicker({
  groups,
  groupJid,
  waConnected,
  onGroupSelect,
  helperText,
  idPrefix = "schedule",
}: CommunityChannelPickerProps): ReactElement {
  const [communityKeyOverride, setCommunityKeyOverride] = useState("");

  const selectedCommunityKey = useMemo(() => {
    const selected = groups.find((g) => g.jid === groupJid);
    if (selected !== undefined) {
      return waGroupCommunityKey(selected);
    }
    return communityKeyOverride;
  }, [groups, groupJid, communityKeyOverride]);

  const communityOptions = useMemo(() => buildWaCommunityPickerOptions(groups), [groups]);

  const channelOptions = useMemo(() => {
    if (selectedCommunityKey.length === 0) {
      return [];
    }
    return groups
      .filter((g) => waGroupCommunityKey(g) === selectedCommunityKey)
      .sort((a, b) => waGroupChannelLabel(a).localeCompare(waGroupChannelLabel(b)));
  }, [groups, selectedCommunityKey]);

  const channelDuplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of channelOptions) {
      const key = waGroupChannelLabel(g);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const duplicate = new Set<string>();
    for (const [k, c] of counts) {
      if (c > 1) {
        duplicate.add(k);
      }
    }
    return duplicate;
  }, [channelOptions]);

  const isStandaloneDestination = waGroupIsStandaloneDestination(selectedCommunityKey);
  const showChannelPicker = !isStandaloneDestination && channelOptions.length > 1;

  const onCommunityChange = (key: string): void => {
    setCommunityKeyOverride(key);
    const channels = groups.filter((g) => waGroupCommunityKey(g) === key);
    if (channels.length === 1) {
      const only = channels[0];
      if (only !== undefined) {
        onGroupSelect(only.jid);
      }
      return;
    }
    if (!channels.some((g) => g.jid === groupJid)) {
      onGroupSelect("");
    }
  };

  return (
    <div className="space-y-4">
      {!waConnected ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertDescription className="flex flex-wrap items-center gap-2 text-sm">
            <span>WhatsApp not connected.</span>
            <Link to="/whatsapp" className="font-semibold text-primary underline underline-offset-2">
              Link your account →
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          "grid gap-4",
          showChannelPicker ? "md:grid-cols-2" : "md:grid-cols-1",
        )}
      >
        <div className="min-w-0 space-y-1.5">
          <Label
            htmlFor={`${idPrefix}-community-select`}
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {isStandaloneDestination ? "WhatsApp group" : "Community"}
          </Label>
          <Select value={selectedCommunityKey} onValueChange={onCommunityChange}>
            <SelectTrigger id={`${idPrefix}-community-select`} className="h-10 w-full">
              <SelectValue placeholder="Select where to post…" />
            </SelectTrigger>
            <SelectContent>
              {communityOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {waConnected
                    ? "No groups yet — go to WhatsApp and load groups."
                    : "Connect WhatsApp first."}
                </div>
              ) : (
                communityOptions.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {showChannelPicker ? (
          <div className="min-w-0 space-y-1.5">
            <Label
              htmlFor={`${idPrefix}-group-select`}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Channel
            </Label>
            <Select value={groupJid} onValueChange={onGroupSelect}>
              <SelectTrigger id={`${idPrefix}-group-select`} className="h-10 w-full">
                <SelectValue placeholder="Select Announcements or a group…" />
              </SelectTrigger>
              <SelectContent>
                {channelOptions.map((g) => {
                  const channelLabel = waGroupChannelLabel(g);
                  const showHint = channelDuplicateNames.has(channelLabel);
                  return (
                    <SelectItem key={g.jid} value={g.jid} title={g.jid}>
                      {showHint
                        ? formatWaGroupPickerLabel(
                            { ...g, label: channelLabel, name: channelLabel },
                            channelDuplicateNames,
                          )
                        : channelLabel}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {helperText !== undefined && helperText.length > 0 ? (
        <p className="text-xs text-muted-foreground leading-snug">{helperText}</p>
      ) : null}
    </div>
  );
}
