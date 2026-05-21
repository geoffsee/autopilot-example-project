import { test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { createServer } from "../src/index";
import {
  isPrivateIp,
  deliverWebhook,
  setupWebhooks,
  registerWebhook,
  deregisterWebhook,
  getWebhookUrl,
} from "../src/webhook";
import { setupNamedCounters } from "../src/counter";

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

// --- deliverWebhook SSRF blocking unit test ---

test("deliverWebhook: blocks delivery when IP resolves to private range", async () => {
  const fetched: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url: string | Request | URL) => {
    fetched.push(String(url));
    return new Response("ok");
  };

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
  globalThis.fetch = async (url: string | Request | URL, opts?: RequestInit) => {
    fetched.push({ url: String(url), body: JSON.parse((opts?.body as string) ?? "{}") });
    return new Response("ok");
  };

  await deliverWebhook(
    "http://hooks.example.com/counter",
    { name: "hits", value: 42, timestamp: "2026-01-01T00:00:00.000Z" },
    { _resolveIp: async () => "93.184.216.34" }
  );

  globalThis.fetch = origFetch;
  expect(fetched).toHaveLength(1);
  expect(fetched[0].url).toBe("http://hooks.example.com/counter");
  expect(fetched[0].body).toEqual({ name: "hits", value: 42, timestamp: "2026-01-01T00:00:00.000Z" });
});

test("deliverWebhook: non-fatal when fetch throws", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("connection refused"); };

  // Should not throw
  await deliverWebhook(
    "http://down.example.com/hook",
    { name: "x", value: 1, timestamp: new Date().toISOString() },
    { _resolveIp: async () => "93.184.216.34" }
  );

  globalThis.fetch = origFetch;
});

// --- DB unit tests ---

test("registerWebhook stores URL; getWebhookUrl retrieves it", () => {
  const db = new Database(":memory:");
  setupWebhooks(db);
  registerWebhook(db, "hits", "https://hooks.example.com/hits");
  expect(getWebhookUrl(db, "hits")).toBe("https://hooks.example.com/hits");
  db.close();
});

test("registerWebhook replaces existing URL for same counter", () => {
  const db = new Database(":memory:");
  setupWebhooks(db);
  registerWebhook(db, "hits", "https://a.example.com/hook");
  registerWebhook(db, "hits", "https://b.example.com/hook");
  expect(getWebhookUrl(db, "hits")).toBe("https://b.example.com/hook");
  db.close();
});

test("deregisterWebhook removes the URL and returns true", () => {
  const db = new Database(":memory:");
  setupWebhooks(db);
  registerWebhook(db, "hits", "https://hooks.example.com/hits");
  expect(deregisterWebhook(db, "hits")).toBe(true);
  expect(getWebhookUrl(db, "hits")).toBeNull();
  db.close();
});

test("deregisterWebhook returns false for unknown counter", () => {
  const db = new Database(":memory:");
  setupWebhooks(db);
  expect(deregisterWebhook(db, "nonexistent")).toBe(false);
  db.close();
});

test("getWebhookUrl returns null when no webhook registered", () => {
  const db = new Database(":memory:");
  setupWebhooks(db);
  expect(getWebhookUrl(db, "hits")).toBeNull();
  db.close();
});

// --- HTTP route integration tests ---

let server: ReturnType<typeof createServer>;
let stubServer: ReturnType<typeof Bun.serve>;
let origin: string;
let stubOrigin: string;
let savedToken: string | undefined;
const deliveries: Array<{ name: string; value: number; timestamp: string }> = [];

beforeAll(() => {
  savedToken = process.env.API_TOKEN;
  process.env.API_TOKEN = TEST_TOKEN;

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
  const delivery = deliveries[deliveries.length - 1];
  expect(delivery.name).toBe("wh-counter");
  expect(typeof delivery.value).toBe("number");
  expect(typeof delivery.timestamp).toBe("string");
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
