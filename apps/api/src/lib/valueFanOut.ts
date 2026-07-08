/**
 * Resolves Value post fan-out destinations (Announcements channels per community).
 */

import type { WaGroupOption } from "../wa/wa-manager.js";

export type FanOutDestination = {
  groupJid: string;
  groupName: string;
};

function normalizeWaGroupRow(g: WaGroupOption): WaGroupOption {
  const name = typeof g.name === "string" ? g.name.trim() : "";
  const communityName =
    typeof g.communityName === "string" && g.communityName.trim().length > 0
      ? g.communityName.trim()
      : undefined;
  const channelName =
    typeof g.channelName === "string" && g.channelName.trim().length > 0
      ? g.channelName.trim()
      : undefined;
  const labelFromParts =
    communityName !== undefined && channelName !== undefined
      ? `${communityName} › ${channelName}`
      : undefined;
  const label =
    typeof g.label === "string" && g.label.trim().length > 0
      ? g.label.trim()
      : labelFromParts ?? name;
  return {
    jid: g.jid,
    name,
    label,
    communityName,
    channelName,
    communityJid:
      typeof g.communityJid === "string" && g.communityJid.trim().length > 0
        ? g.communityJid.trim()
        : undefined,
    isAnnounce: g.isAnnounce === true,
  };
}

function isAnnouncementsChannel(g: WaGroupOption): boolean {
  return g.channelName === "Announcements" || g.isAnnounce === true;
}

/**
 * Returns deduplicated Announcements channel destinations for Value post fan-out.
 */
export function resolveValueFanOutDestinations(groups: WaGroupOption[]): {
  destinations: FanOutDestination[];
  count: number;
} {
  const normalized = groups.map(normalizeWaGroupRow);
  const eligible = normalized.filter(
    (g) => g.communityJid !== undefined && isAnnouncementsChannel(g),
  );
  const byJid = new Map<string, WaGroupOption>();
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
    destinations.push({
      groupJid: g.jid,
      groupName: g.label.length > 0 ? g.label : g.name,
    });
  }
  return { destinations, count: destinations.length };
}
