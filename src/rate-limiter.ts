type Bucket = { tokens: number; lastRefill: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly rps: number,
    private readonly nowFn: () => number = Date.now,
  ) {}

  check(ip: string): boolean {
    const now = this.nowFn();
    const bucket = this.buckets.get(ip);

    if (!bucket) {
      this.buckets.set(ip, { tokens: this.rps - 1, lastRefill: now });
      return true;
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.rps, bucket.tokens + elapsed * this.rps);
    bucket.lastRefill = now;

    if (bucket.tokens >= this.rps - 0.01) {
      this.buckets.delete(ip);
      return true; // evict full bucket and allow; next insert starts at rps-1
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }
}
