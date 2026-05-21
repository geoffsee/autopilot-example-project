interface WindowState {
  count: number;
  windowStart: number;
}

export type RateLimiterFn = {
  (ip: string, now?: number): Response | null;
  activeClients(): number;
};

export function createRateLimiter(opts?: { max?: number; windowMs?: number }): RateLimiterFn {
  const max = opts?.max ?? parseInt(process.env.RATE_LIMIT_MAX ?? "10", 10);
  const windowMs = opts?.windowMs ?? parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "10000", 10);

  const store = new Map<string, WindowState>();

  // Evict entries whose windows have expired so one-time IPs don't accumulate indefinitely.
  setInterval(() => {
    const now = Date.now();
    for (const [ip, state] of store) {
      if (now - state.windowStart >= windowMs) store.delete(ip);
    }
  }, windowMs).unref();

  const check = function(ip: string, now = Date.now()): Response | null {
    const state = store.get(ip);

    if (!state || now - state.windowStart >= windowMs) {
      if (state) store.delete(ip);
      store.set(ip, { count: 1, windowStart: now });
      return null;
    }

    if (state.count >= max) {
      const retryAfterSec = Math.ceil((state.windowStart + windowMs - now) / 1000);
      return new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSec),
        },
      });
    }

    state.count++;
    return null;
  } as RateLimiterFn;

  check.activeClients = () => store.size;

  return check;
}

export const rateLimiter = createRateLimiter();
