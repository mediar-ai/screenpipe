// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import posthog from "posthog-js";

export const FEATURE_FLAG_REFRESH_INTERVAL_MS = 60_000;

// One refresh schedule per webview. Consumers read the SDK's cached values;
// only this schedule refreshes them. SDK-triggered identity refreshes are separate.
const consumers = new Set<() => boolean>();
let timer: ReturnType<typeof setTimeout> | undefined;
let lastAttempt: { monotonic: number; wall: number } | undefined;

function attemptAge(): number {
  if (!lastAttempt) return Infinity;
  // WebKit's performance clock can pause during system sleep. Wall time
  // catches that elapsed time; monotonic time handles wall-clock rollback.
  return Math.max(
    performance.now() - lastAttempt.monotonic,
    Date.now() - lastAttempt.wall,
  );
}

function refresh() {
  if (timer !== undefined) clearTimeout(timer);
  const age = attemptAge();
  if (
    document.visibilityState !== "hidden" &&
    age >= FEATURE_FLAG_REFRESH_INTERVAL_MS &&
    [...consumers].some((canRefresh) => {
      try {
        return canRefresh();
      } catch {
        return false;
      }
    })
  ) {
    try {
      posthog.reloadFeatureFlags();
      // This is an attempt TTL, not proof of a successful response. The SDK
      // retains its cached values on failure; the next minute retries.
      lastAttempt = { monotonic: performance.now(), wall: Date.now() };
    } catch {
      // The SDK may not be initialized yet. Retry on focus or the next tick.
    }
  }

  if (consumers.size === 0) return;
  // A focus refresh after a hidden interval must move the next deadline too,
  // otherwise a fixed timer can leave values stale for almost two minutes.
  const remaining =
    lastAttempt === undefined
      ? FEATURE_FLAG_REFRESH_INTERVAL_MS
      : FEATURE_FLAG_REFRESH_INTERVAL_MS - attemptAge();
  timer = setTimeout(
    refresh,
    remaining > 0 ? remaining : FEATURE_FLAG_REFRESH_INTERVAL_MS,
  );
}

/** Share polling without changing each consumer's consent or build gating. */
export function subscribeToFeatureFlagRefresh(
  canRefresh: () => boolean = () => true,
): () => void {
  // Unique wrapper allows multiple subscribers to pass the same predicate.
  const consumer = () => canRefresh();
  const first = consumers.size === 0;
  consumers.add(consumer);
  if (first) {
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
  }
  refresh();

  return () => {
    consumers.delete(consumer);
    if (consumers.size !== 0) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    lastAttempt = undefined;
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
  };
}
