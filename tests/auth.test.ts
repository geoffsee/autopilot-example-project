import { test, expect } from "bun:test";
import { checkBearerAuth, requireAuth } from "../src/auth";

function makeRequest(authHeader?: string): Request {
  const headers: HeadersInit = {};
  if (authHeader !== undefined) headers["Authorization"] = authHeader;
  return new Request("http://localhost/api/counter", { method: "POST", headers });
}

test("valid token returns null (allowed)", () => {
  const res = checkBearerAuth(makeRequest("Bearer secret123"), "secret123");
  expect(res).toBeNull();
});

test("missing Authorization header returns 401 with error unauthorized", async () => {
  const res = checkBearerAuth(makeRequest(), "secret123");
  expect(res).not.toBeNull();
  expect(res!.status).toBe(401);
  const json = await res!.json() as { error: string };
  expect(json.error).toBe("unauthorized");
});

test("wrong token returns 401 with error unauthorized", async () => {
  const res = checkBearerAuth(makeRequest("Bearer wrongtoken"), "secret123");
  expect(res).not.toBeNull();
  expect(res!.status).toBe(401);
  const json = await res!.json() as { error: string };
  expect(json.error).toBe("unauthorized");
});

test("empty Bearer token returns 401", async () => {
  const res = checkBearerAuth(makeRequest("Bearer "), "secret123");
  expect(res).not.toBeNull();
  expect(res!.status).toBe(401);
});

test("non-Bearer scheme returns 401", async () => {
  const res = checkBearerAuth(makeRequest("Basic dXNlcjpwYXNz"), "secret123");
  expect(res).not.toBeNull();
  expect(res!.status).toBe(401);
});

test("requireAuth returns 500 when API_TOKEN not configured", () => {
  delete process.env.API_TOKEN;
  const res = requireAuth(makeRequest());
  expect(res?.status).toBe(500);
});

test("requireAuth rejects when API_TOKEN set and token missing", () => {
  process.env.API_TOKEN = "secret";
  const res = requireAuth(makeRequest());
  expect(res?.status).toBe(401);
  delete process.env.API_TOKEN;
});

test("requireAuth passes when API_TOKEN set and correct token provided", () => {
  process.env.API_TOKEN = "secret";
  const res = requireAuth(makeRequest("Bearer secret"));
  expect(res).toBeNull();
  delete process.env.API_TOKEN;
});
