#!/usr/bin/env bun
import { Command } from "commander";

import { CONFIG_KEYS, CONFIG_PATH, loadConfig, saveConfig, type ConfigKey } from "./config.js";
import {
  createClient,
  deleteObject,
  ensureTtlLifecycleRule,
  getLifecycleRules,
  listObjects,
  putLifecycleRules,
  ttlPrefix,
  uploadFile,
} from "./r2.js";
import { formatBytes, parseExpiry } from "./util.js";

const program = new Command();

program
  .name("yeet")
  .description("Yeet files at Cloudflare R2 — uploads auto-expire by default.")
  .version("0.1.0");

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ config */

const config = program.command("config").description("Manage configuration.");

config
  .command("set <key> <value>")
  .description(`Set a config value. Keys: ${CONFIG_KEYS.join(", ")}`)
  .action(async (key: string, value: string) => {
    if (!CONFIG_KEYS.includes(key as ConfigKey)) {
      fail(`Unknown key "${key}". Valid keys: ${CONFIG_KEYS.join(", ")}`);
    }
    const parsed: unknown = key === "defaultExpireDays" ? Number(value) : value;
    if (key === "defaultExpireDays" && Number.isNaN(parsed)) {
      fail("defaultExpireDays must be a number (0 = never expire).");
    }
    await saveConfig({ [key]: parsed } as never);
    console.log(`✓ Set ${key}`);
  });

config
  .command("get [key]")
  .description("Print config (secrets are masked).")
  .action(async (key?: string) => {
    const cfg = await loadConfig();
    const masked: Record<string, unknown> = { ...cfg };
    if (masked.secretAccessKey) masked.secretAccessKey = "••••••••";
    if (masked.accessKeyId) masked.accessKeyId = String(masked.accessKeyId).slice(0, 4) + "••••";
    if (key) {
      if (!(key in masked)) fail(`Unknown key "${key}".`);
      console.log(masked[key]);
    } else {
      console.log(JSON.stringify(masked, null, 2));
    }
  });

config
  .command("path")
  .description("Print the config file path.")
  .action(() => console.log(CONFIG_PATH));

/* ------------------------------------------------------------------ upload */

program
  .command("upload <file>")
  .alias("up")
  .description("Upload a file to R2 (auto-expires by default).")
  .option("-b, --bucket <bucket>", "Target bucket (defaults to config).")
  .option("-e, --expire <ttl>", "Expiry: e.g. 7, 7d, 24h, 2w, or 'never'. Defaults to config.")
  .option("--no-expire", "Upload permanently (never auto-delete).")
  .option("-k, --key <name>", "Object name (defaults to the file name).")
  .option("-t, --content-type <type>", "Override the content type.")
  .action(
    async (
      file: string,
      opts: {
        bucket?: string;
        expire?: string | false;
        key?: string;
        contentType?: string;
      },
    ) => {
      const cfg = await loadConfig();
      const bucket = opts.bucket ?? cfg.bucket;
      if (!bucket) fail("No bucket set. Use --bucket or `ut config set bucket <name>`.");

      // Resolve expiry: --no-expire -> null, --expire <ttl> -> parsed,
      // otherwise the configured default (0 => permanent).
      let expireDays: number | null;
      if (opts.expire === false) {
        expireDays = null;
      } else if (typeof opts.expire === "string") {
        try {
          expireDays = parseExpiry(opts.expire);
        } catch (e) {
          fail((e as Error).message);
        }
      } else {
        expireDays = cfg.defaultExpireDays > 0 ? cfg.defaultExpireDays : null;
      }

      const client = createClient(cfg);

      try {
        if (expireDays !== null) {
          await ensureTtlLifecycleRule(client, bucket, expireDays);
        }

        let lastPct = -1;
        const result = await uploadFile(client, {
          filePath: file,
          bucket,
          expireDays,
          permanentPrefix: cfg.permanentPrefix,
          keyName: opts.key,
          contentType: opts.contentType,
          onProgress: (loaded, total) => {
            const pct = total ? Math.floor((loaded / total) * 100) : 0;
            if (pct !== lastPct) {
              lastPct = pct;
              process.stderr.write(`\r  uploading… ${pct}%`);
            }
          },
        });
        process.stderr.write("\r\x1b[K");

        console.log(`✓ Uploaded ${formatBytes(result.size)} → ${bucket}/${result.key}`);
        console.log(
          result.expireDays === null
            ? "  expiry: never"
            : `  expiry: auto-deletes in ${result.expireDays} day(s)`,
        );
        if (cfg.publicBaseUrl) {
          const base = cfg.publicBaseUrl.replace(/\/$/, "");
          console.log(`  url: ${base}/${result.key}`);
        }
      } catch (e) {
        fail((e as Error).message);
      }
    },
  );

/* ---------------------------------------------------------------------- ls */

program
  .command("ls [prefix]")
  .description("List objects in the bucket.")
  .option("-b, --bucket <bucket>", "Target bucket (defaults to config).")
  .action(async (prefix: string | undefined, opts: { bucket?: string }) => {
    const cfg = await loadConfig();
    const bucket = opts.bucket ?? cfg.bucket;
    if (!bucket) fail("No bucket set. Use --bucket or `ut config set bucket <name>`.");
    const client = createClient(cfg);
    try {
      const objects = await listObjects(client, bucket, prefix);
      if (objects.length === 0) {
        console.log("(empty)");
        return;
      }
      for (const o of objects) {
        const size = formatBytes(o.Size ?? 0).padStart(9);
        const date = o.LastModified?.toISOString().slice(0, 10) ?? "----------";
        console.log(`${size}  ${date}  ${o.Key}`);
      }
      console.log(`\n${objects.length} object(s)`);
    } catch (e) {
      fail((e as Error).message);
    }
  });

/* ---------------------------------------------------------------------- rm */

program
  .command("rm <key>")
  .description("Delete an object.")
  .option("-b, --bucket <bucket>", "Target bucket (defaults to config).")
  .action(async (key: string, opts: { bucket?: string }) => {
    const cfg = await loadConfig();
    const bucket = opts.bucket ?? cfg.bucket;
    if (!bucket) fail("No bucket set. Use --bucket or `ut config set bucket <name>`.");
    const client = createClient(cfg);
    try {
      await deleteObject(client, bucket, key);
      console.log(`✓ Deleted ${bucket}/${key}`);
    } catch (e) {
      fail((e as Error).message);
    }
  });

/* --------------------------------------------------------------- lifecycle */

const lifecycle = program
  .command("lifecycle")
  .description("Inspect and manage bucket expiry (lifecycle) rules.");

lifecycle
  .command("list")
  .description("Show current lifecycle rules.")
  .option("-b, --bucket <bucket>", "Target bucket (defaults to config).")
  .action(async (opts: { bucket?: string }) => {
    const cfg = await loadConfig();
    const bucket = opts.bucket ?? cfg.bucket;
    if (!bucket) fail("No bucket set. Use --bucket or `ut config set bucket <name>`.");
    const client = createClient(cfg);
    try {
      const rules = await getLifecycleRules(client, bucket);
      if (rules.length === 0) {
        console.log("(no lifecycle rules)");
        return;
      }
      for (const r of rules) {
        const prefix = r.Filter && "Prefix" in r.Filter ? r.Filter.Prefix : "(all)";
        const days = r.Expiration?.Days;
        console.log(
          `${r.ID}  [${r.Status}]  prefix=${prefix}  expire=${days != null ? `${days}d` : "n/a"}`,
        );
      }
    } catch (e) {
      fail((e as Error).message);
    }
  });

lifecycle
  .command("ensure <days>")
  .description("Create/ensure a TTL lifecycle rule for N days.")
  .option("-b, --bucket <bucket>", "Target bucket (defaults to config).")
  .action(async (days: string, opts: { bucket?: string }) => {
    const cfg = await loadConfig();
    const bucket = opts.bucket ?? cfg.bucket;
    if (!bucket) fail("No bucket set. Use --bucket or `ut config set bucket <name>`.");
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1) fail("days must be a positive integer.");
    const client = createClient(cfg);
    try {
      await ensureTtlLifecycleRule(client, bucket, n);
      console.log(`✓ Ensured rule: objects under ${ttlPrefix(n)}/ expire in ${n} day(s).`);
    } catch (e) {
      fail((e as Error).message);
    }
  });

lifecycle
  .command("rm <id>")
  .description("Remove a lifecycle rule by ID.")
  .option("-b, --bucket <bucket>", "Target bucket (defaults to config).")
  .action(async (id: string, opts: { bucket?: string }) => {
    const cfg = await loadConfig();
    const bucket = opts.bucket ?? cfg.bucket;
    if (!bucket) fail("No bucket set. Use --bucket or `ut config set bucket <name>`.");
    const client = createClient(cfg);
    try {
      const rules = await getLifecycleRules(client, bucket);
      const next = rules.filter((r) => r.ID !== id);
      if (next.length === rules.length) fail(`No rule with ID "${id}".`);
      await putLifecycleRules(client, bucket, next);
      console.log(`✓ Removed rule ${id}`);
    } catch (e) {
      fail((e as Error).message);
    }
  });

program.parseAsync().catch((e) => fail((e as Error).message));
