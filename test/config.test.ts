import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// config.ts reads homedir() at import time, so set HOME before importing it.
let tmpHome: string;
const origHome = process.env.HOME;

beforeEach(async () => {
  tmpHome = await mkdtemp(join(tmpdir(), "yeet-test-"));
  process.env.HOME = tmpHome;
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("R2_")) delete process.env[k];
  }
});

afterEach(async () => {
  process.env.HOME = origHome;
  await rm(tmpHome, { recursive: true, force: true });
});

describe("config", () => {
  test("defaults, save roundtrip, and env overrides", async () => {
    const { loadConfig, saveConfig, resolveEndpoint } = await import(
      `../src/config.ts?home=${encodeURIComponent(tmpHome)}`
    );

    // Defaults when nothing is saved.
    let cfg = await loadConfig();
    expect(cfg.defaultExpireDays).toBe(7);
    expect(cfg.permanentPrefix).toBe("permanent");

    // Persisted values come back.
    await saveConfig({ accountId: "acc123", bucket: "mybucket" });
    cfg = await loadConfig();
    expect(cfg.accountId).toBe("acc123");
    expect(cfg.bucket).toBe("mybucket");
    expect(resolveEndpoint(cfg)).toBe("https://acc123.r2.cloudflarestorage.com");

    // Env vars win over the file.
    process.env.R2_BUCKET = "env-bucket";
    cfg = await loadConfig();
    expect(cfg.bucket).toBe("env-bucket");
  });
});
