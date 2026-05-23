import { test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { createServer } from "../src/index";
import {
  isPrivateIp,
  deliverWebhook,
  registerWebhook,
  deregisterWebhook,
  getWebhookUrl,
  listWebhooks,
  enqueueWebhookDelivery,
  getWebhookDeliveries,
  processWebhookRetries,
} from "../src/webhook";
import { runMigrations } from "../src/migrate";

const TEST_TOKEN = "webhook-test-token";

// --- isPrivateIp unit tests ---

test("isPrivateIp: RFC-1918 10.x.x.x range", () => {
  expect(isPrivateIp("10.0.0.1")).toBe(true);
  expect(isPrivateIp("10.255.255.255")).toBe(true);
  expect(isPrivateIp("11.0.0.1")).toBe(false);
});

test("isPrivateIp: RFC-1918 172.16-31.x.x range", () => {
  expect(isPrivateIp("172.16.0.1")).toBe(true);
  expect(isPrivateIp("172.31.255.255")).toBe(true);
  expect(isPrivateIp("172.15.0.1")).toBe(false);
  expect(isPrivateIp("172.32.0.1")).toBe(false);
});

test("isPrivateIp: RFC-1918 192.168.x.x range", () => {
  expect(isPrivateIp("192.168.0.1")).toBe(true);
  expect(isPrivateIp("192.168.255.255")).toBe(true);
  expect(isPrivateIp("192.167.0.1")).toBe(false);
});

test("isPrivateIp: loopback 127.x.x.x", () => {
  expect(isPrivateIp("127.0.0.1")).toBe(true);
  expect(isPrivateIp("127.1.2.3")).toBe(true);
  expect(isPrivateIp("128.0.0.1")).toBe(false);
});

test("isPrivateIp: 0.0.0.0 any-interface is blocked", () => {
  expect(isPrivateIp("0.0.0.0")).toBe(true);
});

test("isPrivateIp: link-local 169.254.x.x", () => {
  expect(isPrivateIp("169.254.0.1")).toBe(true);
  expect(isPrivateIp("169.253.0.1")).toBe(false);
  expect(isPrivateIp("169.255.0.1")).toBe(false);
});

test("isPrivateIp: public IPs are allowed", () => {
  expect(isPrivateIp("8.8.8.8")).toBe(false);
  expect(isPrivateIp("1.1.1.1")).toBe(false);
  expect(isPrivateIp("93.184.216.34")).toBe(false);
});

test("isPrivateIp: IPv6 private addresses are blocked", () => {
  expect(isPrivateIp("::1")).toBe(true);           // loopback
  expect(isPrivateIp("fe80::1")).toBe(true);        // link-local
  expect(isPrivateIp("fe90::1")).toBe(true);        // link-local (fe80::/10)
  expect(isPrivateIp("fea0::1")).toBe(true);        // link-local (fe80::/10)
  expect(isPrivateIp("feb0::1")).toBe(true);        // link-local (fe80::/10)
  expect(isPrivateIp("febc::1")).toBe(true);        // link-local (fe80::/10)
  expect(isPrivateIp("fc00::1")).toBe(true);        // ULA
  expect(isPrivateIp("fd12:3456::1")).toBe(true);   // ULA
  expect(isPrivateIp("2001:db8::1")).toBe(false);   // documentation range (public)
});

// --- deliverWebhook SSRF blocking unit test ---

test("deliverWebhook: blocks delivery when IP resolves to private range", async () => {
  const fetched: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | Request | URL) => {
    fetched.push(String(url));
    return new Response("ok");
  }) as typeof fetch;

  await deliverWebhook(
    "http://internal.corp/hook",
    { name: "test", value: 1, timestamp: new Date().toISOString() },
    { _resolveIp: async () => "10.0.0.5" }
  );

  globalThis.fetch = origFetch;
  expect(fetched).toHaveLength(0);
});

test("deliverWebhook: delivers when IP resolves to public range", async () => {
  const fetched: Array<{ url: string; body: unknown }> = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | Request | URL, opts?: RequestInit) => {
    fetched.push({ url: String(url), body: JSON.parse((opts?.body as string) ?? "{}") });
    return new Response("ok");
  }) as typeof fetch;

  await deliverWebhook(
    "http://hooks.example.com/counter",
    { name: "hits", value: 42, timestamp: "2026-01-01T00:00:00.000Z" },
    { _resolveIp: async () => "93.184.216.34" }
  );

  globalThis.fetch = origFetch;
  expect(fetched).toHaveLength(1);
  const captured = fetched[0]!;
  expect(captured.url).toBe("http://hooks.example.com/counter");
  expect(captured.body).toEqual({ name: "hits", value: 42, timestamp: "2026-01-01T00:00:00.000Z" });
});

test("deliverWebhook: blocks delivery when IPv6 resolves to private range", async () => {
  const fetched: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | Request | URL) => {
    fetched.push(String(url));
    return new Response("ok");
  }) as typeof fetch;

  await deliverWebhook(
    "http://dual-stack.example.com/hook",
    { name: "test", value: 1, timestamp: new Date().toISOString() },
    { _resolveIp: async () => "93.184.216.34", _resolveIp6: async () => "fc00::1" }
  );

  globalThis.fetch = origFetch;
  expect(fetched).toHaveLength(0);
});

test("deliverWebhook: non-fatal when fetch throws", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("connection refused");
  }) as unknown as typeof fetch;

  // Should not throw
  await deliverWebhook(
    "http://down.example.com/hook",
    { name: "x", value: 1, timestamp: new Date().toISOString() },
    { _resolveIp: async () => "93.184.216.34" }
  );

  globalThis.fetch = origFetch;
});

// --- DB unit tests ---

test("registerWebhook stores URL; getWebhookUrl retrieves it", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  registerWebhook(db, "hits", "https://hooks.example.com/hits");
  expect(getWebhookUrl(db, "hits")).toBe("https://hooks.example.com/hits");
  db.close();
});

test("registerWebhook replaces existing URL for same counter", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  registerWebhook(db, "hits", "https://a.example.com/hook");
  registerWebhook(db, "hits", "https://b.example.com/hook");
  expect(getWebhookUrl(db, "hits")).toBe("https://b.example.com/hook");
  db.close();
});

test("deregisterWebhook removes the URL and returns true", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  registerWebhook(db, "hits", "https://hooks.example.com/hits");
  expect(deregisterWebhook(db, "hits")).toBe(true);
  expect(getWebhookUrl(db, "hits")).toBeNull();
  db.close();
});

test("deregisterWebhook returns false for unknown counter", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  expect(deregisterWebhook(db, "nonexistent")).toBe(false);
  db.close();
});

test("getWebhookUrl returns null when no webhook registered", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  expect(getWebhookUrl(db, "hits")).toBeNull();
  db.close();
});

// --- HTTP route integration tests ---

let server: ReturnType<typeof createServer>;
let stubServer: ReturnType<typeof Bun.serve>;
let origin: string;
let stubOrigin: string;
let savedToken: string | undefined;
let savedReadToken: string | undefined;
const deliveries: Array<{ name: string; value: number; timestamp: string }> = [];

beforeAll(() => {
  savedToken = process.env.API_TOKEN;
  savedReadToken = process.env.READ_TOKEN;
  process.env.API_TOKEN = TEST_TOKEN;
  process.env.READ_TOKEN = TEST_TOKEN;

  // Stub HTTP server to receive webhook deliveries
  stubServer = Bun.serve({
    port: 0,
    async fetch(req) {
      deliveries.push((await req.json()) as { name: string; value: number; timestamp: string });
      return new Response("ok");
    },
  });
  stubOrigin = stubServer.url.origin;

  // App server with SSRF bypassed for testing
  server = createServer(0, {
    async webhookDelivery(url, payload) {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  });
  origin = server.url.origin;
});

afterAll(async () => {
  await server.stop();
  await stubServer.stop();
  if (savedToken === undefined) {
    delete process.env.API_TOKEN;
  } else {
    process.env.API_TOKEN = savedToken;
  }
  if (savedReadToken === undefined) {
    delete process.env.READ_TOKEN;
  } else {
    process.env.READ_TOKEN = savedReadToken;
  }
});

test("POST /api/webhook/:name without auth returns 401", async () => {
  const res = await fetch(`${origin}/api/webhook/hits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: `${stubOrigin}/hook` }),
  });
  expect(res.status).toBe(401);
});

test("POST /api/webhook/:name with wrong token returns 403", async () => {
  const res = await fetch(`${origin}/api/webhook/hits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer wrongtoken",
    },
    body: JSON.stringify({ url: `${stubOrigin}/hook` }),
  });
  expect(res.status).toBe(403);
});

test("POST /api/webhook/:name with missing url body returns 400", async () => {
  const res = await fetch(`${origin}/api/webhook/hits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
});

test("POST /api/webhook/:name with non-http(s) url returns 400", async () => {
  const res = await fetch(`${origin}/api/webhook/hits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({ url: "ftp://example.com/hook" }),
  });
  expect(res.status).toBe(400);
});

test("POST /api/webhook/:name registers webhook and returns 201", async () => {
  const res = await fetch(`${origin}/api/webhook/hits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({ url: `${stubOrigin}/hook` }),
  });
  expect(res.status).toBe(201);
  const body = await res.json() as { name: string; url: string };
  expect(body.name).toBe("hits");
  expect(body.url).toBe(`${stubOrigin}/hook`);
});

test("DELETE /api/webhook/:name without auth returns 401", async () => {
  const res = await fetch(`${origin}/api/webhook/hits`, { method: "DELETE" });
  expect(res.status).toBe(401);
});

test("DELETE /api/webhook/:name for unknown counter returns 404", async () => {
  const res = await fetch(`${origin}/api/webhook/does-not-exist-xyz`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  expect(res.status).toBe(404);
});

test("DELETE /api/webhook/:name deregisters and returns 200", async () => {
  // First register
  await fetch(`${origin}/api/webhook/todelete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({ url: `${stubOrigin}/hook` }),
  });

  const res = await fetch(`${origin}/api/webhook/todelete`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  expect(res.status).toBe(200);
});

test("incrementing a named counter delivers webhook with {name, value, timestamp}", async () => {
  // Register webhook for "wh-counter"
  await fetch(`${origin}/api/webhook/wh-counter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({ url: `${stubOrigin}/hook` }),
  });

  const before = deliveries.length;

  await fetch(`${origin}/api/counter/wh-counter/increment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });

  // Allow async delivery to complete
  await new Promise(r => setTimeout(r, 100));

  expect(deliveries.length).toBe(before + 1);
  const delivery = deliveries.at(-1)!;
  expect(delivery.name).toBe("wh-counter");
  expect(typeof delivery.value).toBe("number");
  expect(typeof delivery.timestamp).toBe("string");
});

// --- listWebhooks unit test ---

test("listWebhooks returns all registered webhooks", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  registerWebhook(db, "alpha", "https://a.example.com/hook");
  registerWebhook(db, "beta", "https://b.example.com/hook");
  const rows = listWebhooks(db);
  expect(rows).toHaveLength(2);
  const ids = rows.map(r => r.id).sort();
  expect(ids).toEqual(["alpha", "beta"]);
  for (const row of rows) {
    expect(typeof row.url).toBe("string");
    expect(typeof row.created_at).toBe("string");
    expect(row.events).toEqual(["counter.increment"]);
  }
  db.close();
});

// --- GET /api/webhooks HTTP integration test ---

test("GET /api/webhooks without auth returns 401", async () => {
  const res = await fetch(`${origin}/api/webhooks`);
  expect(res.status).toBe(401);
});

test("GET /api/webhooks lists registered webhooks", async () => {
  // Register two distinct webhooks
  await fetch(`${origin}/api/webhook/list-a`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_TOKEN}` },
    body: JSON.stringify({ url: `${stubOrigin}/hook-a` }),
  });
  await fetch(`${origin}/api/webhook/list-b`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_TOKEN}` },
    body: JSON.stringify({ url: `${stubOrigin}/hook-b` }),
  });

  const res = await fetch(`${origin}/api/webhooks`, {
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  expect(res.status).toBe(200);
  const body = await res.json() as { webhooks: Array<{ id: string; url: string; events: string[]; created_at: string }> };
  expect(Array.isArray(body.webhooks)).toBe(true);
  const ids = body.webhooks.map(w => w.id);
  expect(ids).toContain("list-a");
  expect(ids).toContain("list-b");
  for (const w of body.webhooks) {
    expect(typeof w.url).toBe("string");
    expect(typeof w.created_at).toBe("string");
    expect(Array.isArray(w.events)).toBe(true);
  }
});

test("increment still returns 200 even when webhook delivery would fail", async () => {
  // Register webhook with a URL that will fail (no server there)
  await fetch(`${origin}/api/webhook/fail-counter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({ url: "http://localhost:1/nonexistent" }),
  });

  // Provide a server with a custom delivery that throws
  const serverWithFailingDelivery = createServer(0, {
    async webhookDelivery() {
      throw new Error("delivery failed");
    },
  });

  try {
    // Seed the webhook in this server too by registering it
    await fetch(`${serverWithFailingDelivery.url.origin}/api/webhook/fail-counter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ url: "http://localhost:1/nonexistent" }),
    });

    const res = await fetch(
      `${serverWithFailingDelivery.url.origin}/api/counter/fail-counter/increment`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      }
    );
    expect(res.status).toBe(200);
  } finally {
    await serverWithFailingDelivery.stop();
  }
});

// --- Delivery queue unit tests ---

test("enqueueWebhookDelivery creates a pending delivery record", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  registerWebhook(db, "queue-test", "http://example.com/hook");
  enqueueWebhookDelivery(db, "queue-test", "http://example.com/hook", {
    name: "queue-test", value: 1, timestamp: "2026-01-01T00:00:00.000Z",
  });
  const rows = getWebhookDeliveries(db, "queue-test");
  expect(rows).toHaveLength(1);
  expect(rows[0]!.status).toBe("pending");
  expect(rows[0]!.attempt_count).toBe(0);
  expect(rows[0]!.webhook_id).toBe("queue-test");
  db.close();
});

test("processWebhookRetries marks delivery success on first attempt", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  registerWebhook(db, "success-test", "http://example.com/hook");
  enqueueWebhookDelivery(db, "success-test", "http://example.com/hook", {
    name: "success-test", value: 1, timestamp: "2026-01-01T00:00:00.000Z",
  });

  const delivered: unknown[] = [];
  await processWebhookRetries(db, async (_url, payload) => { delivered.push(payload); });

  const rows = getWebhookDeliveries(db, "success-test");
  expect(rows[0]!.status).toBe("success");
  expect(rows[0]!.attempt_count).toBe(1);
  expect(delivered).toHaveLength(1);
  db.close();
});

test("processWebhookRetries schedules retry with backoff on first failure", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  registerWebhook(db, "retry-backoff", "http://example.com/hook");
  enqueueWebhookDelivery(db, "retry-backoff", "http://example.com/hook", {
    name: "retry-backoff", value: 1, timestamp: "2026-01-01T00:00:00.000Z",
  });

  const before = Date.now();
  await processWebhookRetries(db, async () => { throw new Error("down"); });

  const rows = getWebhookDeliveries(db, "retry-backoff");
  expect(rows[0]!.status).toBe("pending");
  expect(rows[0]!.attempt_count).toBe(1);
  expect(rows[0]!.next_retry_at).not.toBeNull();
  const nextRetry = new Date(rows[0]!.next_retry_at!).getTime();
  expect(nextRetry).toBeGreaterThan(before + 500);
  db.close();
});

test("retry progression: simulate failing endpoint and verify attempt progression", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  registerWebhook(db, "exhaust-test", "http://example.com/hook");
  enqueueWebhookDelivery(db, "exhaust-test", "http://example.com/hook", {
    name: "exhaust-test", value: 1, timestamp: "2026-01-01T00:00:00.000Z",
  });

  const alwaysFail = async () => { throw new Error("endpoint down"); };

  // 1 initial attempt + 5 retries = 6 total; all fail → status becomes "failed"
  for (let attempt = 1; attempt <= 6; attempt++) {
    // Fast-forward next_retry_at so the worker picks it up immediately
    db.run("UPDATE _webhook_deliveries SET next_retry_at = datetime('now', '-1 second') WHERE status = 'pending'");
    await processWebhookRetries(db, alwaysFail);

    const rows = getWebhookDeliveries(db, "exhaust-test");
    expect(rows[0]!.attempt_count).toBe(attempt);
    if (attempt < 6) {
      expect(rows[0]!.status).toBe("pending");
    } else {
      expect(rows[0]!.status).toBe("failed");
    }
  }

  db.close();
});

test("processWebhookRetries does not pick up deliveries with future next_retry_at", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
  registerWebhook(db, "future-retry", "http://example.com/hook");
  enqueueWebhookDelivery(db, "future-retry", "http://example.com/hook", {
    name: "future-retry", value: 1, timestamp: "2026-01-01T00:00:00.000Z",
  });

  // Set next_retry_at far in the future
  db.run("UPDATE _webhook_deliveries SET next_retry_at = datetime('now', '+1 hour')");

  const delivered: unknown[] = [];
  await processWebhookRetries(db, async (_url, p) => { delivered.push(p); });

  expect(delivered).toHaveLength(0);
  const rows = getWebhookDeliveries(db, "future-retry");
  expect(rows[0]!.attempt_count).toBe(0); // untouched
  db.close();
});

// --- GET /api/webhooks/:id/deliveries integration tests ---

test("GET /api/webhooks/:id/deliveries without auth returns 401", async () => {
  const res = await fetch(`${origin}/api/webhooks/some-webhook/deliveries`);
  expect(res.status).toBe(401);
});

test("GET /api/webhooks/:id/deliveries for unknown webhook returns 404", async () => {
  const res = await fetch(`${origin}/api/webhooks/nonexistent-xyz-abc/deliveries`, {
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  expect(res.status).toBe(404);
});

test("GET /api/webhooks/:id/deliveries returns delivery history after increment", async () => {
  await fetch(`${origin}/api/webhook/delivery-hist`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_TOKEN}` },
    body: JSON.stringify({ url: `${stubOrigin}/hook` }),
  });

  await fetch(`${origin}/api/counter/delivery-hist/increment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });

  await new Promise(r => setTimeout(r, 150));

  const res = await fetch(`${origin}/api/webhooks/delivery-hist/deliveries`, {
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  expect(res.status).toBe(200);
  const body = await res.json() as { deliveries: Array<{ id: number; status: string; attempt_count: number; webhook_id: string }> };
  expect(Array.isArray(body.deliveries)).toBe(true);
  expect(body.deliveries.length).toBeGreaterThan(0);
  expect(body.deliveries[0]!.status).toBe("success");
  expect(body.deliveries[0]!.attempt_count).toBe(1);
  expect(body.deliveries[0]!.webhook_id).toBe("delivery-hist");
});
