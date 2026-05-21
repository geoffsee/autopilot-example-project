import { test, expect } from "bun:test";
import { createAuth } from "../src/auth";

test("no token configured (empty string): auth is skipped", () => {
  const auth = createAuth("");
  const req = new Request("http://localhost/", { method: "POST" });
  expect(auth(req)).toBeNull();
});

test("no token configured (undefined/env not set): auth is skipped", () => {
  // Assumes API_TOKEN is absent in the test environment
  const auth = createAuth(undefined);
  const req = new Request("http://localhost/", { method: "POST" });
  expect(auth(req)).toBeNull();
});

test("token configured, no Authorization header: returns 401", () => {
  const auth = createAuth("secret");
  const req = new Request("http://localhost/", { method: "POST" });
  const res = auth(req);
  expect(res?.status).toBe(401);
});

test("token configured, Bearer prefix missing: returns 401", () => {
  const auth = createAuth("secret");
  const req = new Request("http://localhost/", {
    method: "POST",
    headers: { Authorization: "secret" },
  });
  const res = auth(req);
  expect(res?.status).toBe(401);
});

test("token configured, wrong token: returns 403", () => {
  const auth = createAuth("secret");
  const req = new Request("http://localhost/", {
    method: "POST",
    headers: { Authorization: "Bearer wrongtoken" },
  });
  const res = auth(req);
  expect(res?.status).toBe(403);
});

test("token configured, correct token: returns null (allowed)", () => {
  const auth = createAuth("secret");
  const req = new Request("http://localhost/", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  });
  expect(auth(req)).toBeNull();
});
