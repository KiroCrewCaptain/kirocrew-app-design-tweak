// The dashboard's `utils/timeAgo`, over the SDK's locale-aware `fmtRelative`
// (the dashboard helper is not part of the App SDK; this is its rule).
import { fmtRelative } from '@kirocrew/app-sdk'

/** A timestamp this far ahead of us is clock skew, not the future. */
const SKEW_TOLERANCE_MS = 60_000

/**
 * Human-readable relative time from a unix timestamp (seconds). A missing or
 * unparseable one reads `--`; a slightly-future one (a skewed clock) reads as
 * now, because this only ever renders ages.
 */
export function timeAgo(ts: number): string {
  if (!ts || !Number.isFinite(ts) || ts < 1) return '--'
  const at = new Date(ts * 1000)
  if (Number.isNaN(at.getTime())) return '--'
  const now = Date.now()
  if (at.getTime() > now && at.getTime() - now < SKEW_TOLERANCE_MS) return fmtRelative(now, { now })
  return fmtRelative(at, { now })
}
