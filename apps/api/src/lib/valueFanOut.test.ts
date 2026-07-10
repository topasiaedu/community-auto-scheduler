import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WaGroupOption } from "../wa/wa-manager.js";
import {
  parseActiveCommunityJids,
  resolveValueFanOutDestinations,
  resolveValueFanOutDestinationsForProject,
} from "./valueFanOut.js";

const COMMUNITY_A = "120363000000000001@newsletter";
const COMMUNITY_B = "120363000000000002@newsletter";
const COMMUNITY_C = "120363000000000003@newsletter";

function announcementsChannel(
  jid: string,
  communityJid: string,
  communityName: string,
): WaGroupOption {
  return {
    jid,
    name: `${communityName} Announcements`,
    label: `${communityName} › Announcements`,
    communityName,
    channelName: "Announcements",
    communityJid,
    isAnnounce: true,
  };
}

const sampleGroups: WaGroupOption[] = [
  announcementsChannel("111@g.us", COMMUNITY_A, "RDW 3.0"),
  announcementsChannel("222@g.us", COMMUNITY_B, "RDW 4.0"),
  announcementsChannel("333@g.us", COMMUNITY_C, "RDW 5.0"),
  {
    jid: "999@g.us",
    name: "Standalone group",
    label: "Standalone group",
  },
];

describe("valueFanOut", () => {
  it("resolveValueFanOutDestinations returns all eligible communities", () => {
    const { destinations, count } = resolveValueFanOutDestinations(sampleGroups);
    assert.equal(count, 3);
    assert.deepEqual(
      destinations.map((d) => d.groupJid).sort(),
      ["111@g.us", "222@g.us", "333@g.us"],
    );
  });

  it("null activeCommunityJids uses all eligible communities", () => {
    const { count, destinations } = resolveValueFanOutDestinationsForProject(sampleGroups, null);
    assert.equal(count, 3);
    assert.equal(destinations.length, 3);
  });

  it("empty activeCommunityJids uses all eligible communities", () => {
    const { count } = resolveValueFanOutDestinationsForProject(sampleGroups, []);
    assert.equal(count, 3);
  });

  it("active list subset filters destinations", () => {
    const { destinations, count } = resolveValueFanOutDestinationsForProject(sampleGroups, [
      COMMUNITY_A,
      COMMUNITY_C,
    ]);
    assert.equal(count, 2);
    assert.deepEqual(
      destinations.map((d) => d.groupName),
      ["RDW 3.0 › Announcements", "RDW 5.0 › Announcements"],
    );
  });

  it("active list with no eligible matches returns zero destinations", () => {
    const { count } = resolveValueFanOutDestinationsForProject(sampleGroups, [
      "120363999999999999@newsletter",
    ]);
    assert.equal(count, 0);
  });

  it("parseActiveCommunityJids handles null and arrays", () => {
    assert.equal(parseActiveCommunityJids(null), null);
    assert.deepEqual(parseActiveCommunityJids([]), []);
    assert.deepEqual(parseActiveCommunityJids([COMMUNITY_A, COMMUNITY_B]), [
      COMMUNITY_A,
      COMMUNITY_B,
    ]);
  });
});
