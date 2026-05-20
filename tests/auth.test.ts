import { test, expect } from "bun:test";
import { checkBearerAuth } from "../src/auth";

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
