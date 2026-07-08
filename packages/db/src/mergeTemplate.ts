import type { CampaignCustomValues } from "./campaignTypes.js";

const PLACEHOLDER_KEYS: (keyof CampaignCustomValues)[] = [
  "workshopDay",
  "workshopDate",
  "workshopTime",
  "zoomLink",
  "sessionDate",
  "sessionTime",
  "zoomId",
  "zoomPasscode",
];

/**
 * Substitutes `{{camelCaseKey}}` placeholders in a reminder body template with campaign custom values.
 * Unknown placeholders are left unchanged. Non-throwing.
 */
export function mergeTemplate(
  customValues: CampaignCustomValues,
  bodyTemplate: string,
): string {
  let result = bodyTemplate;
  for (const key of PLACEHOLDER_KEYS) {
    const token = `{{${key}}}`;
    const value = customValues[key];
    result = result.split(token).join(value);
  }
  return result;
}

/**
 * Returns true when the merged string still contains unresolved `{{…}}` placeholders.
 */
export function hasUnresolvedPlaceholders(text: string): boolean {
  return /\{\{[a-zA-Z]+\}\}/.test(text);
}
