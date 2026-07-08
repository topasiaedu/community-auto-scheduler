/**
 * Client-side Value post fan-out resolver (mirrors apps/api/src/lib/valueFanOut.ts).
 */

import { normalizeWaGroupRow } from "./format.js";
import type { WaGroup } from "../types/models.js";

export type FanOutDestination = {
  groupJid: string;
  groupName: string;
};

function isAnnouncementsChannel(g: WaGroup): boolean {
  return g.channelName === "Announcements" || g.isAnnounce === true;
}

/**
 * Returns deduplicated Announcements channel destinations for Value post fan-out.
 */
export function resolveValueFanOutDestinations(groups: readonly WaGroup[]): {
  destinations: FanOutDestination[];
  count: number;
} {
  const normalized = groups.map((g) => normalizeWaGroupRow(g));
  const eligible = normalized.filter(
    (g) => g.communityJid !== undefined && isAnnouncementsChannel(g),
  );
  const byJid = new Map<string, WaGroup>();
  for (const g of eligible) {
    if (!byJid.has(g.jid)) {
      byJid.set(g.jid, g);
    }
  }
  const sorted = [...byJid.values()].sort((a, b) => a.jid.localeCompare(b.jid));
  const seenCommunities = new Set<string>();
  const destinations: FanOutDestination[] = [];
  for (const g of sorted) {
    const communityKey = g.communityJid;
    if (communityKey === undefined || seenCommunities.has(communityKey)) {
      continue;
    }
    seenCommunities.add(communityKey);
    const display =
      g.label !== undefined && g.label.length > 0 ? g.label : g.name;
    destinations.push({
      groupJid: g.jid,
      groupName: display,
    });
  }
  return { destinations, count: destinations.length };
}
