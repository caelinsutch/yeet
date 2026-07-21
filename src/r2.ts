import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  type LifecycleRule,
  type _Object as S3Object,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import mime from "mime-types";

import { assertCredentials, resolveEndpoint, type Config } from "./config.js";

export function createClient(config: Config): S3Client {
  assertCredentials(config);
  return new S3Client({
    region: "auto",
    endpoint: resolveEndpoint(config),
    credentials: {
      accessKeyId: config.accessKeyId!,
      secretAccessKey: config.secretAccessKey!,
    },
  });
}

/** Object key prefix used for a given TTL. */
export function ttlPrefix(days: number): string {
  return `ttl-${days}d`;
}

/** Lifecycle rule id for a given TTL. */
function ttlRuleId(days: number): string {
  return `yeet-ttl-${days}d`;
}

/**
 * Ensure a lifecycle rule exists that expires objects under the TTL prefix
 * after `days` days. Idempotent — merges with any existing rules.
 */
export async function ensureTtlLifecycleRule(
  client: S3Client,
  bucket: string,
  days: number,
): Promise<void> {
  const id = ttlRuleId(days);
  const prefix = `${ttlPrefix(days)}/`;

  let rules: LifecycleRule[] = [];
  try {
    const current = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
    );
    rules = current.Rules ?? [];
  } catch (err: unknown) {
    // No lifecycle configuration yet is fine; anything else re-throws.
    const name = (err as { name?: string }).name;
    if (name !== "NoSuchLifecycleConfiguration") throw err;
  }

  if (rules.some((r) => r.ID === id)) return; // already present

  rules.push({
    ID: id,
    Status: "Enabled",
    Filter: { Prefix: prefix },
    Expiration: { Days: days },
  });

  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: { Rules: rules },
    }),
  );
}

export interface UploadResult {
  key: string;
  bucket: string;
  size: number;
  contentType: string;
  expireDays: number | null;
}

export interface UploadOptions {
  filePath: string;
  bucket: string;
  /** Days until expiry, or null for permanent. */
  expireDays: number | null;
  permanentPrefix: string;
  /** Override the object key (relative to the computed prefix). */
  keyName?: string;
  contentType?: string;
  onProgress?: (loaded: number, total: number) => void;
}

/** Build the full object key including the TTL / permanent prefix. */
export function buildKey(opts: {
  filePath: string;
  expireDays: number | null;
  permanentPrefix: string;
  keyName?: string;
}): string {
  const name = opts.keyName ?? basename(opts.filePath);
  const prefix = opts.expireDays === null ? opts.permanentPrefix : ttlPrefix(opts.expireDays);
  return `${prefix}/${name}`;
}

export async function uploadFile(client: S3Client, opts: UploadOptions): Promise<UploadResult> {
  const info = await stat(opts.filePath);
  if (!info.isFile()) throw new Error(`Not a file: ${opts.filePath}`);

  const key = buildKey(opts);
  const contentType = opts.contentType || mime.lookup(opts.filePath) || "application/octet-stream";

  const upload = new Upload({
    client,
    params: {
      Bucket: opts.bucket,
      Key: key,
      Body: createReadStream(opts.filePath),
      ContentType: contentType,
    },
  });

  if (opts.onProgress) {
    upload.on("httpUploadProgress", (p) => {
      opts.onProgress!(p.loaded ?? 0, p.total ?? info.size);
    });
  }

  await upload.done();

  return {
    key,
    bucket: opts.bucket,
    size: info.size,
    contentType,
    expireDays: opts.expireDays,
  };
}

export async function listObjects(
  client: S3Client,
  bucket: string,
  prefix?: string,
): Promise<S3Object[]> {
  const out: S3Object[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    out.push(...(res.Contents ?? []));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export async function deleteObject(client: S3Client, bucket: string, key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getLifecycleRules(
  client: S3Client,
  bucket: string,
): Promise<LifecycleRule[]> {
  try {
    const res = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
    return res.Rules ?? [];
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "NoSuchLifecycleConfiguration") return [];
    throw err;
  }
}

export async function putLifecycleRules(
  client: S3Client,
  bucket: string,
  rules: LifecycleRule[],
): Promise<void> {
  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: { Rules: rules },
    }),
  );
}
