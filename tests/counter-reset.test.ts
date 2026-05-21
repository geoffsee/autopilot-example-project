import { test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "../src/index";
import { createAuth } from "../src/auth";

const TEST_TOKEN = "reset-test-token";

let server: ReturnType<typeof createServer>;
let origin: string;
let savedToken: string | undefined;

beforeAll(() => {
  savedToken = process.env.API_TOKEN;
  process.env.API_TOKEN = TEST_TOKEN;
  server = createServer(0);
  origin = server.url.origin;
});

afterAll(async () => {
  if (savedToken === undefined) {
    delete process.env.API_TOKEN;
  } else {
    process.env.API_TOKEN = savedToken;
  }
  await server.stop();
});

test("POST /api/counter/:name/reset without auth returns 401", () => {
  const auth = createAuth(TEST_TOKEN);
  const req = new Request("http://localhost/api/counter/hits/reset", { method: "POST" });
  expect(auth(req)?.status).toBe(401);
});

test("POST /api/counter/:name/reset with wrong token returns 403", () => {
  const auth = createAuth(TEST_TOKEN);
  const req = new Request("http://localhost/api/counter/hits/reset", {
    method: "POST",
    headers: { Authorization: "Bearer wrongtoken" },
  });
  expect(auth(req)?.status).toBe(403);
});

test("POST /api/counter/:name/reset on non-existent counter returns 404", async () => {
  const res = await fetch(`${origin}/api/counter/does-not-exist-xyz/reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  expect(res.status).toBe(404);
});

test("POST /api/counter/:name/reset resets existing counter to 0 and returns {name, value: 0}", async () => {
  // Seed the counter by incrementing it twice
  for (let i = 0; i < 2; i++) {
    await fetch(`${origin}/api/counter/resetme/increment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
  }

  const res = await fetch(`${origin}/api/counter/resetme/reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  expect(res.status).toBe(200);
  const body = await res.json() as { name: string; value: number };
  expect(body).toEqual({ name: "resetme", value: 0 });
});
