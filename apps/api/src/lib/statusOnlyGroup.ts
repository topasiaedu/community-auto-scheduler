/**
 * A scheduled reminder with this group id is marked Sent and never handed to WhatsApp.
 * The Telegram status board still runs when the scheduled time arrives.
 */

/** Reserved group id. It is not a WhatsApp JID. */
export const STATUS_ONLY_GROUP_JID = "status-only@nmcas";

/**
 * True when this row must not be sent to a WhatsApp group.
 */
export function isStatusOnlyGroup(groupJid: string): boolean {
  return groupJid.trim() === STATUS_ONLY_GROUP_JID;
}
