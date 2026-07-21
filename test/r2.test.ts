import { describe, expect, test } from "bun:test";

import { buildKey, ttlPrefix } from "../src/r2.ts";

describe("ttlPrefix", () => {
  test("formats days into a prefix segment", () => {
    expect(ttlPrefix(7)).toBe("ttl-7d");
    expect(ttlPrefix(30)).toBe("ttl-30d");
  });
});

describe("buildKey", () => {
  test("expiring uploads land under the TTL prefix", () => {
    expect(
      buildKey({
        filePath: "/tmp/clip.mp4",
        expireDays: 7,
        permanentPrefix: "permanent",
      }),
    ).toBe("ttl-7d/clip.mp4");
  });

  test("permanent uploads land under the permanent prefix", () => {
    expect(
      buildKey({
        filePath: "/tmp/photo.jpg",
        expireDays: null,
        permanentPrefix: "permanent",
      }),
    ).toBe("permanent/photo.jpg");
  });

  test("respects a custom key name", () => {
    expect(
      buildKey({
        filePath: "/tmp/photo.jpg",
        expireDays: null,
        permanentPrefix: "keep",
        keyName: "renamed.jpg",
      }),
    ).toBe("keep/renamed.jpg");
  });

  test("uses the basename, not the full path", () => {
    expect(
      buildKey({
        filePath: "/a/b/c/video.mov",
        expireDays: 1,
        permanentPrefix: "permanent",
      }),
    ).toBe("ttl-1d/video.mov");
  });
});
