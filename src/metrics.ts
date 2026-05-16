let requestCount = 0;
let errorCount = 0;
const durations: number[] = [];
const startTime = Date.now();

export function recordRequest(durationMs: number, status: number): void {
  requestCount++;
  if (status >= 400) errorCount++;
  durations.push(durationMs);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function getMetrics() {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    requestCount,
    errorCount,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
  };
}

export function resetMetrics(): void {
  requestCount = 0;
  errorCount = 0;
  durations.length = 0;
}
