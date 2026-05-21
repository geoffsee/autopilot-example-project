import { test, expect } from "bun:test";
import { createRBAC } from "../src/auth";

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

test("RBAC same write/read token: requireWrite still allows write token", () => {
  const { requireWrite } = createRBAC("shared-secret", "shared-secret");
  const req = new Request("http://localhost/api/counter", {
    method: "POST",
    headers: { Authorization: "Bearer shared-secret" },
  });
  expect(requireWrite(req)).toBeNull();
});

test("RBAC: only READ_TOKEN set, requireWrite is open", () => {
  const { requireWrite } = createRBAC(undefined, "read-secret");
  const req = new Request("http://localhost/api/counter", { method: "POST" });
  expect(requireWrite(req)).toBeNull();
});
