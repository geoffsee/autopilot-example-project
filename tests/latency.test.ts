import { beforeAll, afterAll, test, expect } from "bun:test";
import { createServer } from "../src/index";
import { runBenchmark } from "../src/benchmark";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

test("p95 response time is under LATENCY_THRESHOLD_MS for health, counter, and metrics endpoints", async () => {
  const threshold = Number(process.env.LATENCY_THRESHOLD_MS ?? "200");
  const { p50, p95 } = await runBenchmark(baseUrl, { requestsPerEndpoint: 20 });

  expect(
    p95,
    `p95 latency ${p95.toFixed(1)}ms exceeded threshold ${threshold}ms (p50=${p50.toFixed(1)}ms)`,
  ).toBeLessThan(threshold);
});
