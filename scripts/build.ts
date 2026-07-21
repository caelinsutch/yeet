#!/usr/bin/env bun
/**
 * Cross-compile `yeet` into standalone binaries for every supported platform.
 * Each binary embeds the Bun runtime, so end users do NOT need Bun installed.
 *
 *   bun run scripts/build.ts            # build all targets into dist/
 *   bun run scripts/build.ts darwin-arm64   # build one target
 */
import { $ } from "bun";
import { mkdir, rm } from "node:fs/promises";

// Bun compile target -> released binary name (matches install.sh detection).
const TARGETS: Record<string, string> = {
  "bun-linux-x64": "yeet-linux-x64",
  "bun-linux-arm64": "yeet-linux-arm64",
  "bun-darwin-x64": "yeet-darwin-x64",
  "bun-darwin-arm64": "yeet-darwin-arm64",
  "bun-windows-x64": "yeet-windows-x64.exe",
};

const outDir = "dist";
const only = process.argv[2]; // e.g. "darwin-arm64"

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const entries = Object.entries(TARGETS).filter(([target]) => !only || target.endsWith(only));

if (entries.length === 0) {
  console.error(`No target matches "${only}". Options: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}

for (const [target, name] of entries) {
  const outfile = `${outDir}/${name}`;
  process.stdout.write(`building ${name} … `);
  await $`bun build ./src/index.ts --compile --minify --target=${target} --outfile ${outfile}`.quiet();
  console.log("done");
}

console.log(`\n✓ Built ${entries.length} binary(ies) into ${outDir}/`);
