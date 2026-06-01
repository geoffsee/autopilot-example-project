import { test, expect, beforeAll, afterAll } from "bun:test";
import type { createServer } from "../src/index";

let server: ReturnType<typeof createServer>;
let origin: string;
let savedToken: string | undefined;
let savedReadToken: string | undefined;

beforeAll(async () => {
  savedToken = process.env.API_TOKEN;
  savedReadToken = process.env.READ_TOKEN;
  process.env.API_TOKEN = "";
  process.env.READ_TOKEN = "";
  const { createServer } = await import("../src/index");
  server = createServer(0);
  origin = server.url.origin;
});

afterAll(async () => {
  await server.stop();
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

// --- /api/audit ---

test("GET /api/audit returns { items, next_cursor } envelope", async () => {
  const res = await fetch(`${origin}/api/audit`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: unknown[]; next_cursor: string | null };
  expect(Array.isArray(body.items)).toBe(true);
  expect("next_cursor" in body).toBe(true);
});

test("GET /api/audit?limit=2 paginates with next_cursor", async () => {
  const name = `pg-audit-${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    await fetch(`${origin}/api/counter/${name}/increment`, { method: "POST" });
  }

  const res1 = await fetch(`${origin}/api/audit?counter=${name}&limit=2`);
  const p1 = (await res1.json()) as { items: unknown[]; next_cursor: string | null };
  expect(p1.items).toHaveLength(2);
  expect(p1.next_cursor).not.toBeNull();

  const res2 = await fetch(`${origin}/api/audit?counter=${name}&limit=2&cursor=${p1.next_cursor}`);
  const p2 = (await res2.json()) as { items: unknown[]; next_cursor: string | null };
  expect(p2.items).toHaveLength(2);
  expect(p2.next_cursor).not.toBeNull();

  const res3 = await fetch(`${origin}/api/audit?counter=${name}&limit=2&cursor=${p2.next_cursor}`);
  const p3 = (await res3.json()) as { items: unknown[]; next_cursor: string | null };
  expect(p3.items).toHaveLength(1);
  expect(p3.next_cursor).toBeNull();
});

test("GET /api/audit default limit caps at 100 items", async () => {
  const name = `pg-big-${Date.now()}`;
  for (let i = 0; i < 105; i++) {
    await fetch(`${origin}/api/counter/${name}/increment`, { method: "POST" });
  }
  const res = await fetch(`${origin}/api/audit?counter=${name}`);
  const body = (await res.json()) as { items: unknown[]; next_cursor: string | null };
  expect(body.items.length).toBeLessThanOrEqual(100);
  expect(body.next_cursor).not.toBeNull();
});

// --- /api/webhooks ---

test("GET /api/webhooks returns { items, next_cursor } envelope", async () => {
  const res = await fetch(`${origin}/api/webhooks`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: unknown[]; next_cursor: string | null };
  expect(Array.isArray(body.items)).toBe(true);
  expect("next_cursor" in body).toBe(true);
});

test("GET /api/webhooks?limit=2 paginates and pages cover all items", async () => {
  const prefix = `pg-wh-${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    await fetch(`${origin}/api/webhook/${prefix}-${i}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `http://example.com/hook-${i}` }),
    });
  }

  const allRes = await fetch(`${origin}/api/webhooks`);
  const allBody = (await allRes.json()) as { items: unknown[] };
  const total = allBody.items.length;

  let collected = 0;
  let cursor: string | null = null;
  do {
    const url = cursor
      ? `${origin}/api/webhooks?limit=2&cursor=${cursor}`
      : `${origin}/api/webhooks?limit=2`;
    const res = await fetch(url);
    const body = (await res.json()) as { items: unknown[]; next_cursor: string | null };
    expect(body.items.length).toBeLessThanOrEqual(2);
    collected += body.items.length;
    cursor = body.next_cursor;
  } while (cursor !== null);

  expect(collected).toBe(total);
});

// --- /api/counter?prefix= ---

test("GET /api/counter?prefix= returns { items, next_cursor } envelope", async () => {
  const prefix = `pg-cnt-${Date.now()}`;
  await fetch(`${origin}/api/counter/${prefix}.x/increment`, { method: "POST" });

  const res = await fetch(`${origin}/api/counter?prefix=${prefix}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: unknown[]; next_cursor: string | null };
  expect(Array.isArray(body.items)).toBe(true);
  expect("next_cursor" in body).toBe(true);
});

test("GET /api/counter?prefix= paginates with limit and cursor", async () => {
  const prefix = `pg-cnt-lim-${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    await fetch(`${origin}/api/counter/${prefix}.${i}/increment`, { method: "POST" });
  }

  const res1 = await fetch(`${origin}/api/counter?prefix=${prefix}&limit=2`);
  const p1 = (await res1.json()) as { items: unknown[]; next_cursor: string | null };
  expect(p1.items).toHaveLength(2);
  expect(p1.next_cursor).not.toBeNull();

  const res2 = await fetch(`${origin}/api/counter?prefix=${prefix}&limit=2&cursor=${p1.next_cursor}`);
  const p2 = (await res2.json()) as { items: unknown[]; next_cursor: string | null };
  expect(p2.items).toHaveLength(2);

  const res3 = await fetch(`${origin}/api/counter?prefix=${prefix}&limit=2&cursor=${p2.next_cursor}`);
  const p3 = (await res3.json()) as { items: unknown[]; next_cursor: string | null };
  expect(p3.items).toHaveLength(1);
  expect(p3.next_cursor).toBeNull();
});

test("GET /api/counter?prefix= still includes prefix and total fields", async () => {
  const prefix = `pg-cnt-meta-${Date.now()}`;
  await fetch(`${origin}/api/counter/${prefix}.a/increment`, { method: "POST" });
  await fetch(`${origin}/api/counter/${prefix}.a/increment`, { method: "POST" });
  await fetch(`${origin}/api/counter/${prefix}.b/increment`, { method: "POST" });

  const res = await fetch(`${origin}/api/counter?prefix=${prefix}`);
  const body = (await res.json()) as { items: unknown[]; prefix: string; total: number; next_cursor: string | null };
  expect(body.prefix).toBe(prefix);
  expect(body.total).toBe(3);
  expect(body.items).toHaveLength(2);
});
