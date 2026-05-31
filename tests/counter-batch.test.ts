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

async function getCounterValue(name: string): Promise<number> {
  const res = await fetch(`${origin}/api/counter/${name}`);
  const body = (await res.json()) as { name: string; value: number };
  return body.value;
}

// --- Full success ---

test("POST /api/counter/batch applies all operations and returns results", async () => {
  const ts = Date.now();
  const a = `batch-a-${ts}`;
  const b = `batch-b-${ts}`;
  const c = `batch-c-${ts}`;
  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operations: [
        { name: a, delta: 5 },
        { name: b, delta: -3 },
        { name: c, delta: 10 },
      ],
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { results: Array<{ name: string; value: number }> };
  expect(body.results).toHaveLength(3);
  expect(body.results[0]).toEqual({ name: a, value: 5 });
  expect(body.results[1]).toEqual({ name: b, value: -3 });
  expect(body.results[2]).toEqual({ name: c, value: 10 });
});

test("POST /api/counter/batch multiple ops on same counter accumulate in order", async () => {
  const name = `batch-same-${Date.now()}`;
  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operations: [
        { name, delta: 10 },
        { name, delta: -3 },
      ],
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { results: Array<{ name: string; value: number }> };
  expect(body.results).toHaveLength(2);
  expect(body.results[0]).toEqual({ name, value: 10 });
  expect(body.results[1]).toEqual({ name, value: 7 });
});

test("POST /api/counter/batch with negative delta is valid", async () => {
  const name = `batch-neg-${Date.now()}`;
  await fetch(`${origin}/api/counter/${name}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 10 }),
  });
  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: [{ name, delta: -4 }] }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { results: Array<{ name: string; value: number }> };
  expect(body.results[0]).toEqual({ name, value: 6 });
});

// --- Partial failure rolls back all ---

test("POST /api/counter/batch with delta=0 in batch rejects entire batch and rolls back", async () => {
  const ts = Date.now();
  const nameA = `batch-rb-a-${ts}`;
  const nameB = `batch-rb-b-${ts}`;
  // pre-seed nameA with value 5
  await fetch(`${origin}/api/counter/${nameA}/increment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 5 }),
  });

  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operations: [
        { name: nameA, delta: 10 }, // valid
        { name: nameB, delta: 0 },  // invalid — zero delta
      ],
    }),
  });
  expect(res.status).toBe(400);
  // nameA must remain at 5, not 15
  const valA = await getCounterValue(nameA);
  expect(valA).toBe(5);
});

// --- Oversized batch ---

test("POST /api/counter/batch with 101 operations returns 400 BATCH_TOO_LARGE", async () => {
  const operations = Array.from({ length: 101 }, (_, i) => ({ name: `overflow-${i}`, delta: 1 }));
  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: string; code: string };
  expect(body.code).toBe("BATCH_TOO_LARGE");
});

test("POST /api/counter/batch with exactly 100 operations succeeds", async () => {
  const ts = Date.now();
  const operations = Array.from({ length: 100 }, (_, i) => ({
    name: `max-batch-${ts}-${i}`,
    delta: 1,
  }));
  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { results: Array<{ name: string; value: number }> };
  expect(body.results).toHaveLength(100);
});

// --- Validation ---

test("POST /api/counter/batch with missing operations field returns 400", async () => {
  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
});

test("POST /api/counter/batch with non-array operations returns 400", async () => {
  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: "not-an-array" }),
  });
  expect(res.status).toBe(400);
});

test("POST /api/counter/batch with non-integer delta returns 400", async () => {
  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: [{ name: "x", delta: 1.5 }] }),
  });
  expect(res.status).toBe(400);
});

test("POST /api/counter/batch with missing name returns 400", async () => {
  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: [{ delta: 5 }] }),
  });
  expect(res.status).toBe(400);
});

test("POST /api/counter/batch with invalid JSON returns 400", async () => {
  const res = await fetch(`${origin}/api/counter/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json",
  });
  expect(res.status).toBe(400);
});
