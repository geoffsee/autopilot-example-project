import { beforeAll, afterAll, test, expect } from "bun:test";
import { signJwt, verifyJwt, extractBearer } from "../src/auth";
import { buildConfig } from "../src/config";
import { createServer } from "../src/index";

// --- Unit: signJwt / verifyJwt ---

test("signJwt produces a three-part JWT string", async () => {
  const token = await signJwt({ sub: "alice" }, "secret");
  expect(token.split(".")).toHaveLength(3);
});

test("verifyJwt returns payload for valid token", async () => {
  const token = await signJwt({ sub: "alice" }, "secret");
  const payload = await verifyJwt(token, "secret");
  expect(payload.sub).toBe("alice");
});

test("verifyJwt rejects wrong secret", async () => {
  const token = await signJwt({ sub: "alice" }, "secret");
  expect(verifyJwt(token, "wrong-secret")).rejects.toThrow();
});

test("verifyJwt rejects expired token", async () => {
  const token = await signJwt({ sub: "alice" }, "secret", -1);
  expect(verifyJwt(token, "secret")).rejects.toThrow(/expired/i);
});

test("verifyJwt rejects tampered payload", async () => {
  const token = await signJwt({ sub: "alice" }, "secret");
  const [h, p, s] = token.split(".");
  const tampered = `${h}.${p}X.${s}`;
  expect(verifyJwt(tampered, "secret")).rejects.toThrow();
});

test("verifyJwt rejects malformed token (wrong part count)", () => {
  expect(verifyJwt("not.a.valid.jwt.here", "secret")).rejects.toThrow();
});

// --- Unit: extractBearer ---

test("extractBearer returns token from valid Authorization header", () => {
  const req = new Request("http://localhost/test", {
    headers: { authorization: "Bearer mytoken123" },
  });
  expect(extractBearer(req)).toBe("mytoken123");
});

test("extractBearer returns null when Authorization header is absent", () => {
  const req = new Request("http://localhost/test");
  expect(extractBearer(req)).toBeNull();
});

test("extractBearer returns null for non-Bearer scheme", () => {
  const req = new Request("http://localhost/test", {
    headers: { authorization: "Basic abc123" },
  });
  expect(extractBearer(req)).toBeNull();
});

// --- Integration ---

const TEST_SECRET = "test-jwt-secret-for-auth-tests";
const testConfig = buildConfig({ NODE_ENV: "test", JWT_SECRET: TEST_SECRET });

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0, testConfig);
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

test("POST /api/counter/:name without token returns 401", async () => {
  const res = await fetch(`${baseUrl}/api/counter/hits`, { method: "POST" });
  expect(res.status).toBe(401);
});

test("POST /api/counter/:name with invalid signature returns 401", async () => {
  const badToken = await signJwt({ sub: "user" }, "wrong-secret");
  const res = await fetch(`${baseUrl}/api/counter/hits`, {
    method: "POST",
    headers: { authorization: `Bearer ${badToken}` },
  });
  expect(res.status).toBe(401);
});

test("POST /api/counter/:name with expired token returns 401", async () => {
  const expired = await signJwt({ sub: "user" }, TEST_SECRET, -1);
  const res = await fetch(`${baseUrl}/api/counter/hits`, {
    method: "POST",
    headers: { authorization: `Bearer ${expired}` },
  });
  expect(res.status).toBe(401);
});

test("POST /api/counter/:name with valid token returns 200 and count", async () => {
  const token = await signJwt({ sub: "user" }, TEST_SECRET);

  const res = await fetch(`${baseUrl}/api/counter/widgets`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { count: number };
  expect(typeof body.count).toBe("number");
  expect(body.count).toBeGreaterThan(0);
});

test("POST /api/counter/:name increments the named counter independently", async () => {
  const token = await signJwt({ sub: "user" }, TEST_SECRET);

  const headers = { authorization: `Bearer ${token}` };

  await fetch(`${baseUrl}/api/counter/alpha`, { method: "POST", headers });
  await fetch(`${baseUrl}/api/counter/alpha`, { method: "POST", headers });
  await fetch(`${baseUrl}/api/counter/beta`, { method: "POST", headers });

  const alphaRes = await fetch(`${baseUrl}/api/counter/alpha`);
  const betaRes = await fetch(`${baseUrl}/api/counter/beta`);

  const alpha = (await alphaRes.json()) as { count: number };
  const beta = (await betaRes.json()) as { count: number };

  expect(alpha.count).toBeGreaterThanOrEqual(2);
  expect(beta.count).toBeGreaterThanOrEqual(1);
  expect(alpha.count).toBeGreaterThan(beta.count);
});

test("GET /api/counter/:name returns current count without auth", async () => {
  const res = await fetch(`${baseUrl}/api/counter/public-read-test`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { count: number };
  expect(typeof body.count).toBe("number");
});
