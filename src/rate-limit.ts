import { Database } from "bun:sqlite";
import { errorJson, ErrorCode } from "./errors";

interface WindowState {
  count: number;
  windowStart: number;
}

export type RateLimiterFn = {
  (ip: string, now?: number): Response | null;
  activeClients(): number;
};

export function createRateLimiter(opts?: { max?: number; windowMs?: number; db?: Database }): RateLimiterFn {
  const max = opts?.max ?? parseInt(process.env.RATE_LIMIT_MAX ?? "10", 10);
  const windowMs = opts?.windowMs ?? parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "10000", 10);
  const db = opts?.db;

  const store = new Map<string, WindowState>();

  if (db) {
    // Prune stale windows then load active ones into memory
    db.run("DELETE FROM _rate_limits WHERE window_start <= ?", [Date.now() - windowMs]);
    const rows = db.query<{ ip: string; count: number; window_start: number }, []>(
      "SELECT ip, count, window_start FROM _rate_limits"
    ).all();
    for (const row of rows) {
      store.set(row.ip, { count: row.count, windowStart: row.window_start });
    }
  }

  // Evict expired entries from memory and DB periodically
  setInterval(() => {
    const now = Date.now();
    for (const [ip, state] of store) {
      if (now - state.windowStart >= windowMs) {
        store.delete(ip);
        db?.run("DELETE FROM _rate_limits WHERE ip = ?", [ip]);
      }
    }
  }, windowMs).unref();

  const check = Object.assign(
    function(ip: string, now = Date.now()): Response | null {
      const state = store.get(ip);

      if (!state || now - state.windowStart >= windowMs) {
        if (state) store.delete(ip);
        store.set(ip, { count: 1, windowStart: now });
        db?.run(
          "INSERT OR REPLACE INTO _rate_limits (ip, count, window_start) VALUES (?, ?, ?)",
          [ip, 1, now],
        );
        return null;
      }

      if (state.count >= max) {
        const retryAfterSec = Math.ceil((state.windowStart + windowMs - now) / 1000);
        return errorJson(
          "Too Many Requests",
          ErrorCode.TOO_MANY_REQUESTS,
          429,
          { "Retry-After": String(retryAfterSec) },
        );
      }

      state.count++;
      db?.run("UPDATE _rate_limits SET count = ? WHERE ip = ?", [state.count, ip]);
      return null;
    },
    { activeClients: () => store.size }
  ) satisfies RateLimiterFn;

  return check;
}

export const rateLimiter = createRateLimiter();
