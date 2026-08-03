/**
 * Sample Custom Values for Settings merge preview (P7 UX spec §8).
 */

import type { CampaignCustomValues } from "../types/models.js";
import {
  customValuesLocaleForProject,
  type CustomValuesLocale,
} from "./deriveCustomValues.js";

export const SAMPLE_CUSTOM_VALUES_EN: CampaignCustomValues = {
  workshopDay: "Monday",
  workshopDate: "29/6",
  workshopTime: "8PM (GMT +8)",
  zoomLink: "https://drjasminechiew.com/zoom",
  sessionDate: "Jun 29, 2026",
  sessionTime: "8:00PM – 10:00PM (GMT+8)",
  zoomId: "819 5208 2119",
  zoomPasscode: "8888",
};

/** Chinese community preview — matches Kheli format `8月6号 (星期四)`. */
export const SAMPLE_CUSTOM_VALUES_ZH: CampaignCustomValues = {
  workshopDay: "星期四",
  workshopDate: "8月6号",
  workshopTime: "8PM",
  zoomLink: "https://example.com/zoom",
  sessionDate: "2026年8月6日",
  sessionTime: "8:00PM – 10:00PM (GMT+8)",
  zoomId: "819 5208 2119",
  zoomPasscode: "8888",
};

/** @deprecated Prefer sampleCustomValuesForLocale / sampleCustomValuesForProject. */
export const SAMPLE_CUSTOM_VALUES = SAMPLE_CUSTOM_VALUES_EN;

export function sampleCustomValuesForLocale(
  locale: CustomValuesLocale,
): CampaignCustomValues {
  return locale === "zh-CN" ? SAMPLE_CUSTOM_VALUES_ZH : SAMPLE_CUSTOM_VALUES_EN;
}

export function sampleCustomValuesForProject(projectName: string): CampaignCustomValues {
  return sampleCustomValuesForLocale(customValuesLocaleForProject(projectName));
}
