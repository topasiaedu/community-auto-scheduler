/**
 * Substitutes `{{camelCaseKey}}` placeholders in reminder body templates.
 * Mirrors packages/db mergeTemplate (non-throwing; unknown placeholders unchanged).
 */

import type { CampaignCustomValues } from "../types/models.js";

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

export function hasUnresolvedPlaceholders(text: string): boolean {
  return /\{\{[a-zA-Z]+\}\}/.test(text);
}
