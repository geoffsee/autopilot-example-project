import { test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "../src/index";

let server: ReturnType<typeof createServer>;
let origin: string;

beforeAll(() => {
  server = createServer(0);
  origin = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

// --- C1: Increment with delta ---

test("POST /api/counter/:name/increment with no body defaults to delta=1", async () => {
  const name = `incr-default-${Date.now()}`;
  const res = await fetch(`${origin}/api/counter/${name}/increment`, { method: "POST" });
  expect(res.status).toBe(200);
  const body = await res.json() as { name: string; value: number };
  expect(body.name).toBe(name);
  expect(body.value).toBe(1);
});

test("POST /api/counter/:name/increment with { delta: 7 } increments by 7", async () => {
  const name = `incr-explicit-${Date.now()}`;
  const res = await fetch(`${origin}/api/counter/${name}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 7 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json() as { name: string; value: number };
  expect(body.name).toBe(name);
  expect(body.value).toBe(7);
});

test("POST /api/counter/:name/increment successive calls accumulate delta", async () => {
  const name = `incr-accum-${Date.now()}`;
  await fetch(`${origin}/api/counter/${name}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 3 }),
  });
  const res = await fetch(`${origin}/api/counter/${name}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 4 }),
  });
  const body = await res.json() as { value: number };
  expect(body.value).toBe(7);
});

// --- C2: Decrement with delta ---

test("POST /api/counter/:name/decrement with no body defaults to delta=1", async () => {
  const name = `decr-default-${Date.now()}`;
  await fetch(`${origin}/api/counter/${name}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 5 }),
  });
  const res = await fetch(`${origin}/api/counter/${name}/decrement`, { method: "POST" });
  expect(res.status).toBe(200);
  const body = await res.json() as { name: string; value: number };
  expect(body.name).toBe(name);
  expect(body.value).toBe(4);
});

test("POST /api/counter/:name/decrement with { delta: 3 } decrements by 3", async () => {
  const name = `decr-explicit-${Date.now()}`;
  await fetch(`${origin}/api/counter/${name}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 10 }),
  });
  const res = await fetch(`${origin}/api/counter/${name}/decrement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 3 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json() as { name: string; value: number };
  expect(body.name).toBe(name);
  expect(body.value).toBe(7);
});

test("POST /api/counter/:name/decrement can produce a negative result", async () => {
  const name = `decr-neg-${Date.now()}`;
  const res = await fetch(`${origin}/api/counter/${name}/decrement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 5 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json() as { name: string; value: number };
  expect(body.name).toBe(name);
  expect(body.value).toBe(-5);
});

// --- Concurrent calls (atomicity) ---

test("concurrent increment calls each receive a unique value (atomic)", async () => {
  const name = `atomic-incr-${Date.now()}`;
  const N = 10;
  const responses = await Promise.all(
    Array.from({ length: N }, () =>
      fetch(`${origin}/api/counter/${name}/increment`, { method: "POST" })
    )
  );
  const bodies = await Promise.all(
    responses.map(r => r.json() as Promise<{ value: number }>)
  );
  const values = bodies.map(b => b.value).sort((a, b) => a - b);
  expect(values).toEqual(Array.from({ length: N }, (_, i) => i + 1));
});

test("concurrent decrement calls each receive a unique value (atomic)", async () => {
  const name = `atomic-decr-${Date.now()}`;
  const N = 10;
  await fetch(`${origin}/api/counter/${name}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: N }),
  });
  const responses = await Promise.all(
    Array.from({ length: N }, () =>
      fetch(`${origin}/api/counter/${name}/decrement`, { method: "POST" })
    )
  );
  const bodies = await Promise.all(
    responses.map(r => r.json() as Promise<{ value: number }>)
  );
  const values = bodies.map(b => b.value).sort((a, b) => a - b);
  expect(values).toEqual(Array.from({ length: N }, (_, i) => i));
});

// --- History stores signed delta ---

test("audit history stores positive delta for increment", async () => {
  const name = `delta-audit-incr-${Date.now()}`;
  await fetch(`${origin}/api/counter/${name}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 7 }),
  });
  const auditRes = await fetch(`${origin}/api/audit?counter=${name}`);
  expect(auditRes.status).toBe(200);
  const audit = await auditRes.json() as { items: Array<{ delta: number | null; new_value: number }> };
  expect(audit.items).toHaveLength(1);
  expect(audit.items[0]!.delta).toBe(7);
  expect(audit.items[0]!.new_value).toBe(7);
});

test("audit history stores negative delta for decrement", async () => {
  const name = `delta-audit-decr-${Date.now()}`;
  await fetch(`${origin}/api/counter/${name}/decrement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 3 }),
  });
  const auditRes = await fetch(`${origin}/api/audit?counter=${name}`);
  expect(auditRes.status).toBe(200);
  const audit = await auditRes.json() as { items: Array<{ delta: number | null; new_value: number }> };
  expect(audit.items).toHaveLength(1);
  expect(audit.items[0]!.delta).toBe(-3);
  expect(audit.items[0]!.new_value).toBe(-3);
});

// --- Validation ---

test("POST /api/counter/:name/increment with delta=0 returns 400", async () => {
  const name = `val-incr-zero-${Date.now()}`;
  const res = await fetch(`${origin}/api/counter/${name}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 0 }),
  });
  expect(res.status).toBe(400);
});

test("POST /api/counter/:name/increment with delta=-1 returns 400", async () => {
  const name = `val-incr-neg-${Date.now()}`;
  const res = await fetch(`${origin}/api/counter/${name}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: -1 }),
  });
  expect(res.status).toBe(400);
});

test("POST /api/counter/:name/decrement with delta=0 returns 400", async () => {
  const name = `val-decr-zero-${Date.now()}`;
  const res = await fetch(`${origin}/api/counter/${name}/decrement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 0 }),
  });
  expect(res.status).toBe(400);
});

test("POST /api/counter/:name/decrement with delta=-5 returns 400", async () => {
  const name = `val-decr-neg-${Date.now()}`;
  const res = await fetch(`${origin}/api/counter/${name}/decrement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: -5 }),
  });
  expect(res.status).toBe(400);
});

// --- Webhook delivery on decrement ---

test("POST /api/counter/:name/decrement triggers webhook delivery", async () => {
  const delivered: Array<{ name: string; value: number; timestamp: string }> = [];
  const webhookServer = createServer(0, {
    async webhookDelivery(_url, payload) {
      delivered.push(payload as { name: string; value: number; timestamp: string });
    },
  });
  try {
    const wOrigin = webhookServer.url.origin;
    const name = `webhook-decr-${Date.now()}`;

    await fetch(`${wOrigin}/api/counter/${name}/increment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta: 5 }),
    });

    const regRes = await fetch(`${wOrigin}/api/webhook/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://example.com/hook" }),
    });
    expect(regRes.status).toBe(201);

    const res = await fetch(`${wOrigin}/api/counter/${name}/decrement`, { method: "POST" });
    expect(res.status).toBe(200);

    await new Promise(r => setTimeout(r, 100));

    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.name).toBe(name);
    expect(delivered[0]!.value).toBe(4);
    expect(typeof delivered[0]!.timestamp).toBe("string");
  } finally {
    await webhookServer.stop();
  }
});
