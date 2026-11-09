// The advert details UTMify understands. Shared by the browser, which reads them
// from the address, and the server, which never trusts what the browser sends.

export const TRACKING_KEYS = [
  "src",
  "sck",
  "utm_source",
  "utm_campaign",
  "utm_medium",
  "utm_content",
  "utm_term",
] as const;

export type TrackingKey = (typeof TRACKING_KEYS)[number];
export type TrackingParams = Partial<Record<TrackingKey, string>>;

const MAX_LENGTH = 300;

/** Keeps only the known keys with sensible string values. Null when nothing is left. */
export function cleanTrackingParams(input: unknown): TrackingParams | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const cleaned: TrackingParams = {};
  for (const key of TRACKING_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) cleaned[key] = value.trim().slice(0, MAX_LENGTH);
  }
  return Object.keys(cleaned).length ? cleaned : null;
}
