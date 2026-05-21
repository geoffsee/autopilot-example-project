import { test, expect, beforeAll, afterAll } from "bun:test";
import { isPrivateIp, isAllowedWebhookUrl, createWebhookDelivery } from "../src/webhook";
import { serve } from "bun";

// ---- Unit: private IP detection ----

test("isPrivateIp: blocks 10.x RFC-1918", () => {
  expect(isPrivateIp("10.0.0.1")).toBe(true);
  expect(isPrivateIp("10.255.255.255")).toBe(true);
});

test("isPrivateIp: blocks 172.16-31.x RFC-1918", () => {
  expect(isPrivateIp("172.16.0.1")).toBe(true);
  expect(isPrivateIp("172.31.255.255")).toBe(true);
  expect(isPrivateIp("172.15.0.1")).toBe(false);
  expect(isPrivateIp("172.32.0.1")).toBe(false);
});

test("isPrivateIp: blocks 192.168.x RFC-1918", () => {
  expect(isPrivateIp("192.168.1.1")).toBe(true);
  expect(isPrivateIp("192.169.1.1")).toBe(false);
});

test("isPrivateIp: blocks loopback", () => {
  expect(isPrivateIp("127.0.0.1")).toBe(true);
  expect(isPrivateIp("127.255.0.1")).toBe(true);
  expect(isPrivateIp("::1")).toBe(true);
});

test("isPrivateIp: blocks link-local", () => {
  expect(isPrivateIp("169.254.0.1")).toBe(true);
  expect(isPrivateIp("169.254.169.254")).toBe(true); // AWS metadata endpoint
});

test("isPrivateIp: blocks IPv6 unique-local", () => {
  expect(isPrivateIp("fc00::1")).toBe(true);
  expect(isPrivateIp("fd12:3456:789a::1")).toBe(true);
});

test("isPrivateIp: allows public addresses", () => {
  expect(isPrivateIp("1.1.1.1")).toBe(false);
  expect(isPrivateIp("8.8.8.8")).toBe(false);
  expect(isPrivateIp("93.184.216.34")).toBe(false);
});

// ---- Unit: URL allowlist ----

test("isAllowedWebhookUrl: rejects non-http(s) protocols", async () => {
  expect(await isAllowedWebhookUrl("ftp://example.com/hook")).toBe(false);
  expect(await isAllowedWebhookUrl("file:///etc/passwd")).toBe(false);
});

test("isAllowedWebhookUrl: rejects malformed URLs", async () => {
  expect(await isAllowedWebhookUrl("not-a-url")).toBe(false);
  expect(await isAllowedWebhookUrl("")).toBe(false);
});

test("isAllowedWebhookUrl: rejects URLs with private IPv4 literal hosts", async () => {
  expect(await isAllowedWebhookUrl("http://127.0.0.1/hook")).toBe(false);
  expect(await isAllowedWebhookUrl("http://10.0.0.1/hook")).toBe(false);
  expect(await isAllowedWebhookUrl("http://192.168.1.1/hook")).toBe(false);
});

test("isAllowedWebhookUrl: allows public IPv4 literal host", async () => {
  // dns.lookup on a literal IP address returns it directly without a real DNS query
  expect(await isAllowedWebhookUrl("http://1.2.3.4/hook")).toBe(true);
});

// ---- Mock server harness for outbound delivery tests ----

type ReceivedCall = { body: unknown; headers: Record<string, string> };
const received: ReceivedCall[] = [];
let mockServer: ReturnType<typeof serve>;
let mockUrl: string;

// deliverForTest bypasses SSRF so the mock localhost server is reachable
const deliverForTest = createWebhookDelivery(async () => true);

beforeAll(() => {
  mockServer = serve({
    port: 0,
    routes: {
      "/webhook": {
        async POST(req: Request) {
          received.push({
            body: await req.json(),
            headers: Object.fromEntries(req.headers.entries()),
          });
          return Response.json({ ok: true });
        },
      },
      "/error": {
        POST() {
          return new Response("internal error", { status: 500 });
        },
      },
    },
  });
  mockUrl = `http://127.0.0.1:${mockServer.port}/webhook`;
});

afterAll(() => {
  mockServer.stop(true);
});

test("deliverWebhook: POSTs JSON payload to the webhook URL", async () => {
  const before = received.length;
  await deliverForTest(mockUrl, { event: "counter.increment", name: "hits", value: 42 });
  expect(received.length).toBe(before + 1);
  expect(received[received.length - 1]!.body).toMatchObject({
    event: "counter.increment",
    name: "hits",
    value: 42,
  });
});

test("deliverWebhook: sets Content-Type application/json", async () => {
  const before = received.length;
  await deliverForTest(mockUrl, { event: "test" });
  expect(received[received.length - 1]!.headers["content-type"]).toContain("application/json");
  expect(received.length).toBe(before + 1);
});

test("deliverWebhook: does not throw when server returns non-2xx", async () => {
  const errorUrl = `http://127.0.0.1:${mockServer.port}/error`;
  await expect(deliverForTest(errorUrl, { event: "test" })).resolves.toBeUndefined();
});

test("deliverWebhook: does not throw on network error (unreachable host)", async () => {
  // Port 1 is effectively unreachable on localhost
  await expect(
    deliverForTest("http://127.0.0.1:1/webhook", { event: "test" })
  ).resolves.toBeUndefined();
});

test("deliverWebhook: blocks private URL and does not deliver", async () => {
  // Use the production SSRF-protected version — import it from the module
  const { deliverWebhook } = await import("../src/webhook");
  const before = received.length;
  await deliverWebhook(`http://127.0.0.1:${mockServer.port}/webhook`, { event: "test" });
  // no new calls should have been recorded
  expect(received.length).toBe(before);
});

// ---- Integration: counter endpoint is not affected by webhook errors ----

test("POST /api/counter/:name/increment succeeds even when WEBHOOK_URL is a blocked private address", async () => {
  const { createServer } = await import("../src/index");
  // Blocked by SSRF — deliverWebhook will log an error and return without throwing
  process.env.WEBHOOK_URL = "http://10.0.0.1/hook";
  const server = createServer(0);
  try {
    const res = await fetch(`${server.url.origin}/api/counter/ssrf-test/increment`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; value: number };
    expect(body.name).toBe("ssrf-test");
    expect(typeof body.value).toBe("number");
  } finally {
    server.stop(true);
    delete process.env.WEBHOOK_URL;
  }
});

test("deliverWebhook via createWebhookDelivery (bypass validator) delivers to mock server", async () => {
  const before = received.length;
  await deliverForTest(mockUrl, { event: "counter.increment", name: "mock-test", value: 7 });
  expect(received.length).toBe(before + 1);
  expect(received[received.length - 1]!.body).toMatchObject({
    event: "counter.increment",
    name: "mock-test",
    value: 7,
  });
});
