// Usage: BASE_URL=http://localhost:3000 LATENCY_THRESHOLD_MS=200 bun scripts/benchmark.ts

import { runBenchmark } from "../src/benchmark";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const threshold = Number(process.env.LATENCY_THRESHOLD_MS ?? "200");

console.log(`Benchmarking ${baseUrl} (threshold=${threshold}ms) ...`);

const result = await runBenchmark(baseUrl, { requestsPerEndpoint: 20 });

console.log(`p50: ${result.p50.toFixed(2)}ms`);
console.log(`p95: ${result.p95.toFixed(2)}ms`);
console.log(`min: ${result.min.toFixed(2)}ms`);
console.log(`max: ${result.max.toFixed(2)}ms`);

if (result.p95 >= threshold) {
  console.error(`FAIL: p95 ${result.p95.toFixed(1)}ms >= threshold ${threshold}ms`);
  process.exit(1);
} else {
  console.log(`PASS: p95 ${result.p95.toFixed(1)}ms < threshold ${threshold}ms`);
}
