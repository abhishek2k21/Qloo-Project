/**
 * Sliding-window rate limiter, keyed by an arbitrary string (e.g. client IP).
 *
 * Pure and testable: `now` is injectable so the window-reset logic can be
 * driven deterministically in tests.
 *
 * createRateLimiter({ max, windowMs, now? }):
 *   (key: string) => { allowed: boolean, retryAfterSec: number }
 *
 * A key is allowed up to `max` requests within any rolling `windowMs`
 * window. Once exceeded, `allowed` is false and `retryAfterSec` tells the
 * client how long to wait.
 */
export function createRateLimiter({ max = 10, windowMs = 60000, now = () => Date.now() }) {
  const hits = new Map(); // key -> array of timestamps within the window

  return function check(key) {
    const t = now();
    const windowStart = t - windowMs;
    const list = (hits.get(key) || []).filter((ts) => ts > windowStart);
    hits.set(key, list);

    if (list.length < max) {
      list.push(t);
      return { allowed: true, retryAfterSec: 0 };
    }

    const oldest = list[0];
    const waitMs = oldest + windowMs - t;
    return { allowed: false, retryAfterSec: Math.ceil(waitMs / 1000) };
  };
}
