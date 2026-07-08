/**
 * Groups queue messages by campaign for collapsible sections (P7 UX spec §7).
 */

import type { ScheduledMessage } from "../types/models.js";

export type QueueCampaignGroup = {
  campaignId: string;
  webinarDate: string;
  messages: ScheduledMessage[];
  earliestScheduledAt: string;
  expandByDefault: boolean;
};

export type QueueGroupedMessages = {
  campaignGroups: QueueCampaignGroup[];
  otherMessages: ScheduledMessage[];
};

function isActiveStatus(status: string): boolean {
  return status === "PENDING" || status === "FAILED";
}

export function groupQueueMessages(messages: ScheduledMessage[]): QueueGroupedMessages {
  const byCampaign = new Map<string, ScheduledMessage[]>();
  const otherMessages: ScheduledMessage[] = [];

  for (const message of messages) {
    const campaignId = message.campaignId;
    if (campaignId !== null && campaignId !== undefined && campaignId.length > 0) {
      const existing = byCampaign.get(campaignId);
      if (existing !== undefined) {
        existing.push(message);
      } else {
        byCampaign.set(campaignId, [message]);
      }
    } else {
      otherMessages.push(message);
    }
  }

  const campaignGroups: QueueCampaignGroup[] = [];
  for (const [campaignId, groupMessages] of byCampaign.entries()) {
    const sorted = [...groupMessages].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
    const earliest = sorted[0];
    const webinarDate =
      earliest?.campaignWebinarDate ??
      groupMessages.find((m) => m.campaignWebinarDate !== null && m.campaignWebinarDate !== undefined)
        ?.campaignWebinarDate ??
      "";
    campaignGroups.push({
      campaignId,
      webinarDate,
      messages: sorted,
      earliestScheduledAt: earliest?.scheduledAt ?? "",
      expandByDefault: groupMessages.some((m) => isActiveStatus(m.status)),
    });
  }

  campaignGroups.sort(
    (a, b) =>
      new Date(a.earliestScheduledAt).getTime() - new Date(b.earliestScheduledAt).getTime(),
  );

  otherMessages.sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  );

  return { campaignGroups, otherMessages };
}
