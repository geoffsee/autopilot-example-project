// Measures sequential p50/p95 latency across the three primary endpoints.

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
      await fetch(url).then(r => r.body?.cancel());
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
