import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export interface Config {
  /** Cloudflare account id (used to derive the R2 endpoint). */
  accountId?: string;
  /** R2 access key id. */
  accessKeyId?: string;
  /** R2 secret access key. */
  secretAccessKey?: string;
  /** Default bucket to upload to. */
  bucket?: string;
  /** Explicit S3 endpoint override. Derived from accountId when omitted. */
  endpoint?: string;
  /** Default number of days before an upload auto-deletes. 0 = never. */
  defaultExpireDays: number;
  /** Prefix used for objects that should never expire. */
  permanentPrefix: string;
  /** Optional public base URL (r2.dev domain or custom domain) for share links. */
  publicBaseUrl?: string;
}

export const CONFIG_DIR = join(homedir(), ".yeet");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: Config = {
  defaultExpireDays: 7,
  permanentPrefix: "permanent",
};

export const CONFIG_KEYS = [
  "accountId",
  "accessKeyId",
  "secretAccessKey",
  "bucket",
  "endpoint",
  "defaultExpireDays",
  "permanentPrefix",
  "publicBaseUrl",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

/** Load config from disk, layering env vars on top. */
export async function loadConfig(): Promise<Config> {
  let fileConfig: Partial<Config> = {};
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    fileConfig = JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const config: Config = { ...DEFAULT_CONFIG, ...fileConfig };

  // Environment variables win over the config file.
  if (process.env.R2_ACCOUNT_ID) config.accountId = process.env.R2_ACCOUNT_ID;
  if (process.env.R2_ACCESS_KEY_ID) config.accessKeyId = process.env.R2_ACCESS_KEY_ID;
  if (process.env.R2_SECRET_ACCESS_KEY) config.secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (process.env.R2_BUCKET) config.bucket = process.env.R2_BUCKET;
  if (process.env.R2_ENDPOINT) config.endpoint = process.env.R2_ENDPOINT;
  if (process.env.R2_PUBLIC_BASE_URL) config.publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  return config;
}

/** Persist config to disk (only the file-backed values, not env overrides). */
export async function saveConfig(config: Partial<Config>): Promise<void> {
  let existing: Partial<Config> = {};
  try {
    existing = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const merged = { ...DEFAULT_CONFIG, ...existing, ...config };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
}

/** Resolve the S3 endpoint for R2 from config. */
export function resolveEndpoint(config: Config): string {
  if (config.endpoint) return config.endpoint;
  if (config.accountId) return `https://${config.accountId}.r2.cloudflarestorage.com`;
  throw new Error(
    "No R2 endpoint configured. Run `yeet config set accountId <id>` or `yeet config set endpoint <url>`.",
  );
}

/** Throw a friendly error if required credentials are missing. */
export function assertCredentials(config: Config): void {
  const missing: string[] = [];
  if (!config.accessKeyId) missing.push("accessKeyId");
  if (!config.secretAccessKey) missing.push("secretAccessKey");
  if (!config.accountId && !config.endpoint) missing.push("accountId");
  if (missing.length > 0) {
    throw new Error(
      `Missing R2 credentials: ${missing.join(", ")}.\n` +
        "Set them with `yeet config set <key> <value>` or via R2_* environment variables.",
    );
  }
}
