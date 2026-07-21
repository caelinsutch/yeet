export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Parse an expiry option into days or null (permanent). */
export function parseExpiry(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (v === "never" || v === "none" || v === "0") return null;
  // Accept forms like "7", "7d", "24h", "2w".
  const match = v.match(/^(\d+)\s*(d|day|days|h|hour|hours|w|week|weeks)?$/);
  if (!match) throw new Error(`Invalid expiry: "${value}" (try 7, 7d, 24h, 2w, or never)`);
  const n = Number(match[1]);
  const unit = match[2] ?? "d";
  if (unit.startsWith("h")) return Math.max(1, Math.ceil(n / 24));
  if (unit.startsWith("w")) return n * 7;
  return n;
}
