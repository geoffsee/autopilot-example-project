export class RateLimiter {
  private windows = new Map<string, number[]>();
  readonly rpm: number;
  readonly windowMs: number;

  constructor(rpm: number, windowMs = 60_000) {
    this.rpm = rpm;
    this.windowMs = windowMs;
  }

  check(ip: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const hits = (this.windows.get(ip) ?? []).filter(t => t > cutoff);
    hits.push(now);
    this.windows.set(ip, hits);
    return hits.length > this.rpm;
  }
}

export function createRateLimiter(windowMs?: number): RateLimiter {
  const rpm = parseInt(process.env.RATE_LIMIT_RPM ?? "60", 10);
  return new RateLimiter(rpm, windowMs);
}

export function applyRateLimit(limiter: RateLimiter, ip: string): Response | null {
  if (limiter.check(ip)) {
    return Response.json({ error: "Too Many Requests" }, { status: 429 });
  }
  return null;
}
