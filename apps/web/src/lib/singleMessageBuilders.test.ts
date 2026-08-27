import { describe, expect, it } from "vitest";
import {
  buildPatchSingleMessageBody,
  buildSingleMessageBody,
  validateValuePostImagePath,
  type SingleMessageFields,
} from "./singleMessageBuilders.js";
import { SAMPLE_CUSTOM_VALUES } from "./sampleCustomValues.js";

const BASE_FIELDS: SingleMessageFields = {
  operatorKind: "VALUE",
  valueFormat: "IMAGE_CAPTION",
  scheduledLocal: "2099-01-01T12:00",
  groupJid: "120363000000000000@g.us",
  groupName: "Test Group",
  copyText: "Hello",
  imagePath: "posts/project-a/upload-id/photo.jpg",
  pollQuestion: "",
  pollOptions: ["", ""],
  pollMultiSelect: false,
  reminderTemplateId: "",
  customValues: SAMPLE_CUSTOM_VALUES,
};

describe("validateValuePostImagePath", () => {
  it("accepts paths under the active project", () => {
    expect(validateValuePostImagePath("posts/project-a/id/file.jpg", "project-a")).toBeNull();
  });

  it("rejects paths from another project", () => {
    expect(validateValuePostImagePath("posts/project-b/id/file.jpg", "project-a")).not.toBeNull();
  });
});

describe("buildSingleMessageBody", () => {
  it("rejects fan-out image paths outside the active project", () => {
    const result = buildSingleMessageBody({
      ...BASE_FIELDS,
      fanOut: true,
      projectId: "project-a",
      imagePath: "posts/project-b/id/file.jpg",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("uploaded for this workspace");
    }
  });
});

describe("buildPatchSingleMessageBody", () => {
  it("builds a single-group draft publish payload", () => {
    const result = buildPatchSingleMessageBody(BASE_FIELDS, true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.operatorKind).toBe("VALUE");
      expect(result.body.publish).toBe(true);
      expect(result.body.groupJid).toBe(BASE_FIELDS.groupJid);
      expect(result.body.fanOut).toBeUndefined();
    }
  });
});
