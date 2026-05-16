import { test, expect } from "bun:test";
import { signJwt, verifyJwt, extractBearer } from "../src/auth";

const SECRET = "test-secret";

test("signJwt/verifyJwt round-trip returns original payload fields", async () => {
  const token = await signJwt({ sub: "alice", role: "admin" }, SECRET);
  const payload = await verifyJwt(token, SECRET);
  expect(payload.sub).toBe("alice");
  expect(payload.role).toBe("admin");
  expect(typeof payload.iat).toBe("number");
  expect(typeof payload.exp).toBe("number");
});

test("verifyJwt rejects an expired token", async () => {
  const token = await signJwt({ sub: "bob" }, SECRET, -1);
  await expect(verifyJwt(token, SECRET)).rejects.toThrow("JWT expired");
});

test("verifyJwt rejects a token with a tampered signature", async () => {
  const token = await signJwt({ sub: "carol" }, SECRET);
  const [header, payload] = token.split(".");
  const tampered = `${header}.${payload}.invalidsignature`;
  await expect(verifyJwt(tampered, SECRET)).rejects.toThrow("Invalid JWT: signature mismatch");
});

test("verifyJwt rejects a token with wrong number of parts", async () => {
  await expect(verifyJwt("not.a.valid.token", SECRET)).rejects.toThrow(
    "Invalid JWT: expected three parts"
  );
});

test("verifyJwt rejects a token signed with a different secret", async () => {
  const token = await signJwt({ sub: "dave" }, SECRET);
  await expect(verifyJwt(token, "wrong-secret")).rejects.toThrow(
    "Invalid JWT: signature mismatch"
  );
});

test("extractBearer returns the token from a valid Authorization header", () => {
  const req = new Request("http://localhost/", {
    headers: { authorization: "Bearer mytoken123" },
  });
  expect(extractBearer(req)).toBe("mytoken123");
});

test("extractBearer returns null when Authorization header is absent", () => {
  const req = new Request("http://localhost/");
  expect(extractBearer(req)).toBeNull();
});

test("extractBearer returns null for non-Bearer schemes", () => {
  const req = new Request("http://localhost/", {
    headers: { authorization: "Basic dXNlcjpwYXNz" },
  });
  expect(extractBearer(req)).toBeNull();
});
