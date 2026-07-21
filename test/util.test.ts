import { describe, expect, test } from "bun:test";

import { formatBytes, parseExpiry } from "../src/util.ts";

describe("formatBytes", () => {
  test("zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  test("bytes stay integral", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  test("scales to KB/MB/GB with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });
});

describe("parseExpiry", () => {
  test("plain number is days", () => {
    expect(parseExpiry("7")).toBe(7);
  });

  test("day/week/hour units", () => {
    expect(parseExpiry("7d")).toBe(7);
    expect(parseExpiry("2w")).toBe(14);
    expect(parseExpiry("48h")).toBe(2);
  });

  test("sub-day hours round up to 1 day (R2 min granularity)", () => {
    expect(parseExpiry("1h")).toBe(1);
    expect(parseExpiry("12h")).toBe(1);
  });

  test("never/none/0 mean permanent (null)", () => {
    expect(parseExpiry("never")).toBeNull();
    expect(parseExpiry("none")).toBeNull();
    expect(parseExpiry("0")).toBeNull();
  });

  test("case-insensitive and trims whitespace", () => {
    expect(parseExpiry("  7D ")).toBe(7);
    expect(parseExpiry("NEVER")).toBeNull();
  });

  test("rejects garbage", () => {
    expect(() => parseExpiry("soon")).toThrow();
    expect(() => parseExpiry("7x")).toThrow();
    expect(() => parseExpiry("")).toThrow();
  });
});
