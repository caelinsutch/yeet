# yeet

Yeet files (videos, photos, anything) at a Cloudflare **R2** bucket from the
command line. Uploads **auto-expire** after a while by default via R2 lifecycle
rules, and everything is configurable. Runs on [Bun](https://bun.sh).

## How expiry works

R2 (S3-compatible) expires objects with **bucket lifecycle rules**, which act on
a key **prefix** and delete objects N days after creation. `yeet` uses this by:

1. Storing each upload under a TTL prefix, e.g. `ttl-7d/my-video.mp4`.
2. Ensuring a lifecycle rule exists that deletes everything under `ttl-7d/`
   after 7 days (created automatically on first use, idempotent).

Yeeting with `--no-expire` (or a config default of `0`) stores the object under
the `permanent/` prefix, which has no lifecycle rule.

> Note: R2 lifecycle granularity is **days** (minimum 1). Sub-day TTLs like
> `12h` are rounded up to 1 day.

## Install

`yeet` ships as a **standalone binary** (Bun runtime embedded) — end users need
nothing installed to run it.

### Users (prebuilt binary)

```bash
curl -fsSL https://raw.githubusercontent.com/caelinsutch/yeet/main/install.sh | bash
```

Override the source/version/location with env vars if needed:

```bash
YEET_REPO=caelinsutch/yeet YEET_VERSION=v0.1.0 YEET_BIN_DIR=~/.local/bin \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/caelinsutch/yeet/main/install.sh)"
```

Windows: download `yeet-windows-x64.exe` from the
[latest release](https://github.com/caelinsutch/yeet/releases/latest).

### From source (requires Bun ≥ 1.1)

```bash
bun install
bun link                 # makes `yeet` available globally
# or a single standalone binary for this machine:
bun run build            # -> ./yeet
# or every platform at once (CI does this on tag push):
bun run build:all        # -> dist/yeet-{linux,darwin,windows}-*
```

Run without installing via `bun run src/index.ts …`.

## Do I need a server?

No. `yeet` is a **pure client-side CLI** that talks straight to R2 over the S3
API using your credentials. There is nothing to host or deploy — the only
Cloudflare-side resource is the bucket itself.

## What you need

Four values from an R2 S3 API token — create one in the Cloudflare dashboard at
**R2 → Manage R2 API Tokens → Create API Token** (Object Read & Write):

- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — the token's keys
- `R2_ACCOUNT_ID` — shown on the R2 overview page (or set `R2_ENDPOINT` instead)
- `R2_BUCKET` — the bucket to upload to

`R2_PUBLIC_BASE_URL` is optional (used for printed share links). Provide these
as env vars, or save them with `yeet config set` (below).

## Configure

Credentials and defaults live in `~/.yeet/config.json`. Set them once:

```bash
yeet config set accountId <cloudflare-account-id>
yeet config set accessKeyId <r2-access-key-id>
yeet config set secretAccessKey <r2-secret-access-key>
yeet config set bucket <bucket-name>

# Optional
yeet config set defaultExpireDays 7          # 0 = never expire by default
yeet config set permanentPrefix permanent    # prefix for non-expiring uploads
yeet config set publicBaseUrl https://cdn.example.com   # for share links
```

Any value can also be supplied via environment variables (these win over the
file): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
`R2_ENDPOINT`, `R2_PUBLIC_BASE_URL`.

Inspect config (secrets masked):

```bash
yeet config get
yeet config path
```

## Usage

```bash
# Yeet with the default expiry from config
yeet upload ./clip.mp4

# Custom expiry: 7, 7d, 24h, 2w, or never
yeet upload ./photo.jpg --expire 30d
yeet upload ./photo.jpg --no-expire

# Override bucket, object name, or content type
yeet upload ./a.bin -b other-bucket -k renamed.bin -t application/octet-stream

# List objects (optionally by prefix)
yeet ls
yeet ls ttl-7d/

# Delete an object
yeet rm ttl-7d/clip.mp4

# Lifecycle rule management
yeet lifecycle list
yeet lifecycle ensure 30       # ensure a 30-day TTL rule exists
yeet lifecycle rm yeet-ttl-30d
```

Large files are streamed with multipart upload, so big videos are handled
without loading them into memory. `upload` has the alias `up`.

## Scripts

```bash
bun run start       # run the CLI
bun run typecheck   # tsc --noEmit
bun run lint        # oxlint
bun run fmt         # oxfmt (write)
bun test            # run tests
bun run build       # standalone ./yeet binary for this machine
bun run build:all   # binaries for every platform -> dist/
```

## Agent skill

An LLM skill lives in [`skills/yeet/SKILL.md`](skills/yeet/SKILL.md) — it teaches
coding agents how to install and drive `yeet`. It is MIT-licensed and publishable
to [skills.sh](https://www.skills.sh).

## License

[MIT](LICENSE) © Caelin Sutch
