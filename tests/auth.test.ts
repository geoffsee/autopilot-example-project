import { test, expect } from "bun:test";
import { createAuth, createRBAC } from "../src/auth";

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

// --- RBAC: createRBAC ---

test("RBAC open mode (no tokens): requireWrite allows all", () => {
  const { requireWrite } = createRBAC(undefined, undefined);
  const req = new Request("http://localhost/api/counter", { method: "POST" });
  expect(requireWrite(req)).toBeNull();
});

test("RBAC open mode (no tokens): requireRead allows all", () => {
  const { requireRead } = createRBAC(undefined, undefined);
  const req = new Request("http://localhost/api/counter", { method: "GET" });
  expect(requireRead(req)).toBeNull();
});

test("RBAC backward compat: only API_TOKEN set, requireRead is open (GET stays open)", () => {
  const { requireRead } = createRBAC("write-secret", undefined);
  const req = new Request("http://localhost/api/counter", { method: "GET" });
  expect(requireRead(req)).toBeNull();
});

test("RBAC write token accepted on POST (requireWrite)", () => {
  const { requireWrite } = createRBAC("write-secret", "read-secret");
  const req = new Request("http://localhost/api/counter", {
    method: "POST",
    headers: { Authorization: "Bearer write-secret" },
  });
  expect(requireWrite(req)).toBeNull();
});

test("RBAC write token accepted on GET (requireRead)", () => {
  const { requireRead } = createRBAC("write-secret", "read-secret");
  const req = new Request("http://localhost/api/counter", {
    method: "GET",
    headers: { Authorization: "Bearer write-secret" },
  });
  expect(requireRead(req)).toBeNull();
});

test("RBAC read token accepted on GET (requireRead)", () => {
  const { requireRead } = createRBAC("write-secret", "read-secret");
  const req = new Request("http://localhost/api/counter", {
    method: "GET",
    headers: { Authorization: "Bearer read-secret" },
  });
  expect(requireRead(req)).toBeNull();
});

test("RBAC read token rejected on POST with 403 (requireWrite)", () => {
  const { requireWrite } = createRBAC("write-secret", "read-secret");
  const req = new Request("http://localhost/api/counter", {
    method: "POST",
    headers: { Authorization: "Bearer read-secret" },
  });
  const res = requireWrite(req);
  expect(res?.status).toBe(403);
});

test("RBAC requireRead: no auth header when READ_TOKEN set returns 401", () => {
  const { requireRead } = createRBAC("write-secret", "read-secret");
  const req = new Request("http://localhost/api/counter", { method: "GET" });
  const res = requireRead(req);
  expect(res?.status).toBe(401);
});

test("RBAC requireRead: wrong token when READ_TOKEN set returns 403", () => {
  const { requireRead } = createRBAC("write-secret", "read-secret");
  const req = new Request("http://localhost/api/counter", {
    method: "GET",
    headers: { Authorization: "Bearer wrong-token" },
  });
  const res = requireRead(req);
  expect(res?.status).toBe(403);
});

test("RBAC requireWrite: no auth header when API_TOKEN set returns 401", () => {
  const { requireWrite } = createRBAC("write-secret", "read-secret");
  const req = new Request("http://localhost/api/counter", { method: "POST" });
  const res = requireWrite(req);
  expect(res?.status).toBe(401);
});

test("RBAC requireWrite: wrong token returns 403", () => {
  const { requireWrite } = createRBAC("write-secret", "read-secret");
  const req = new Request("http://localhost/api/counter", {
    method: "POST",
    headers: { Authorization: "Bearer wrong-token" },
  });
  const res = requireWrite(req);
  expect(res?.status).toBe(403);
});
