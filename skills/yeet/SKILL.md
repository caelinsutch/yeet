---
name: yeet
description: Upload files (videos, photos, any asset) to a Cloudflare R2 bucket from the command line using the `yeet` CLI, with uploads that auto-expire after a configurable period. Use when a user wants to upload/share a file to R2, get a shareable link, set or change how long an upload lives before auto-deleting, list or delete R2 objects, or manage R2 lifecycle (TTL) rules. Triggers include "upload this to R2", "put this file in the bucket", "share this video", "make it expire in N days", or "clean up old uploads".
metadata:
  author: caelinsutch
  version: "0.1.0"
  argument-hint: <file>
---

# yeet — CLI uploads to Cloudflare R2 with auto-expiry

`yeet` is a standalone CLI that uploads files to a Cloudflare **R2** bucket over
the S3 API. Uploads **auto-expire** by default using R2 lifecycle rules, so
temporary assets clean themselves up. It is a pure client — there is **no server
or backend** involved.

## Prerequisites (what to check first)

`yeet` needs R2 S3 API credentials. Confirm these are available as env vars or
in `~/.yeet/config.json` before running commands:

- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — from an R2 API token
- `R2_ACCOUNT_ID` (or `R2_ENDPOINT`) — identifies the account/endpoint
- `R2_BUCKET` — the target bucket
- `R2_PUBLIC_BASE_URL` (optional) — base URL used to print share links

Create the token in the Cloudflare dashboard: **R2 → Manage R2 API Tokens →
Create API Token** with **Object Read & Write**. If credentials are missing,
`yeet` prints exactly which values it needs — surface that to the user rather
than guessing.

## Install

If `yeet` is not on PATH, install the prebuilt binary (no runtime needed):

```bash
curl -fsSL https://raw.githubusercontent.com/caelinsutch/yeet/main/install.sh | bash
```

From source instead (requires [Bun](https://bun.sh) ≥ 1.1):

```bash
bun install && bun link
```

## How expiry works (important mental model)

R2 expires objects with **bucket lifecycle rules** keyed by object **prefix**,
at **day** granularity (minimum 1 day). `yeet` maps a TTL onto this:

- An upload with a TTL of N days is stored under the prefix `ttl-Nd/` (e.g.
  `ttl-7d/clip.mp4`), and `yeet` ensures a lifecycle rule exists that deletes
  everything under `ttl-Nd/` after N days. Rule creation is automatic and
  idempotent.
- `--no-expire` stores the object under the `permanent/` prefix (no rule).
- Sub-day TTLs like `12h` round **up** to 1 day.

Because expiry is prefix-based, the object key encodes its TTL. Two uploads of
the same filename with different TTLs live at different keys and do not collide.

## Commands

```bash
# Upload with the configured default expiry
yeet upload ./clip.mp4

# Choose an expiry: bare days, or 7d / 24h / 2w / never
yeet upload ./photo.jpg --expire 30d
yeet upload ./photo.jpg --no-expire

# Options
#   -b, --bucket <name>          override the default bucket
#   -k, --key <name>             object name (defaults to the file name)
#   -t, --content-type <type>    override the auto-detected content type

# List objects (optionally filter by prefix)
yeet ls
yeet ls ttl-7d/

# Delete an object by key
yeet rm ttl-7d/clip.mp4

# Inspect / manage expiry rules directly
yeet lifecycle list
yeet lifecycle ensure 30        # ensure a 30-day TTL rule exists
yeet lifecycle rm yeet-ttl-30d

# Configuration (persisted to ~/.yeet/config.json)
yeet config set bucket my-bucket
yeet config set defaultExpireDays 7     # 0 means "never expire by default"
yeet config get                          # secrets are masked
```

## Guidance for agents

- Default to letting uploads expire. Only pass `--no-expire` when the user
  clearly wants the asset kept indefinitely.
- When the user says something like "for a week" / "keep it a month", translate
  to `--expire 7d` / `--expire 30d`. Anything under a day becomes `--expire 1d`.
- After a successful upload, report the resulting `bucket/key`, the expiry, and
  the share URL if `R2_PUBLIC_BASE_URL` is configured (it's printed for you).
- Large videos are streamed via multipart upload; no special flags needed.
- Never print or echo `R2_SECRET_ACCESS_KEY`. Use `yeet config get`, which masks
  secrets, when you need to show current settings.
- If a command fails with a missing-credentials error, relay the exact missing
  keys and the token-creation steps above instead of retrying blindly.
