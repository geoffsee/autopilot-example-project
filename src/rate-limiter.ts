interface RateWindow {
  count: number;
  start: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, RateWindow>();
  readonly limit: number;
  readonly windowMs: number;

  constructor(limit: number, windowMs = 1000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  check(ip: string): boolean {
    const now = Date.now();
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.windowMs) this.windows.delete(key);
    }
    const win = this.windows.get(ip);
    if (!win || now - win.start >= this.windowMs) {
      this.windows.set(ip, { count: 1, start: now });
      return true;
    }
    if (win.count < this.limit) {
      win.count++;
      return true;
    }
    return false;
  }

  remaining(ip: string): number {
    const win = this.windows.get(ip);
    if (!win || Date.now() - win.start >= this.windowMs) return this.limit;
    return Math.max(0, this.limit - win.count);
  }

  resetAt(ip: string): number {
    const win = this.windows.get(ip);
    if (!win || Date.now() - win.start >= this.windowMs) {
      return Math.ceil((Date.now() + this.windowMs) / 1000);
    }
    return Math.ceil((win.start + this.windowMs) / 1000);
  }
}
