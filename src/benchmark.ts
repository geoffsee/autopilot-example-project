/**
 * F5 CI Latency Baseline Benchmark
 *
 * Traffic pattern: sequential (concurrency=1, one request at a time)
 * Request count: requestsPerEndpoint × 3 (default 60 total)
 * Concurrency: 1 (sequential)
 * Endpoints:
 *   GET /api/health
 *   GET /api/counter/:name
 *   GET /metrics
 */

export interface BenchmarkOptions {
  requestsPerEndpoint?: number;
}

export interface BenchmarkResult {
  p50: number;
  p95: number;
  min: number;
  max: number;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export async function runBenchmark(baseUrl: string, opts: BenchmarkOptions = {}): Promise<BenchmarkResult> {
  const { requestsPerEndpoint = 20 } = opts;
  const endpoints = [
    `${baseUrl}/api/health`,
    `${baseUrl}/api/counter/bench`,
    `${baseUrl}/metrics`,
  ];

  const latencies: number[] = [];

  for (const url of endpoints) {
    for (let i = 0; i < requestsPerEndpoint; i++) {
      const start = performance.now();
      await fetch(url);
      latencies.push(performance.now() - start);
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}
