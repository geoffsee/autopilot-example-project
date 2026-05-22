import { test, expect } from "bun:test";
import { createRBAC, createAuthMiddleware } from "../src/auth";

const WRITE_TOK = "write-secret";
const READ_TOK = "read-secret";

function makeRbac() {
  return createRBAC(WRITE_TOK, READ_TOK);
}

function readHeaders() {
  return { Authorization: `Bearer ${READ_TOK}` };
}

function writeHeaders() {
  return { Authorization: `Bearer ${WRITE_TOK}` };
}

// --- withRead ---

test("withRead: unauthenticated request returns 401", () => {
  const { withRead } = createAuthMiddleware(makeRbac());
  const handler = withRead((_req: Request) => Response.json({ ok: true }));
  const res = handler(new Request("http://localhost/api/test"));
  expect(res.status).toBe(401);
});

test("withRead: read token passes through to handler", async () => {
  const { withRead } = createAuthMiddleware(makeRbac());
  const handler = withRead((_req: Request) => Response.json({ ok: true }));
  const res = await handler(new Request("http://localhost/api/test", { headers: readHeaders() }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("withRead: write token also passes (write implies read)", async () => {
  const { withRead } = createAuthMiddleware(makeRbac());
  const handler = withRead((_req: Request) => Response.json({ ok: true }));
  const res = await handler(new Request("http://localhost/api/test", { headers: writeHeaders() }));
  expect(res.status).toBe(200);
});

test("withRead: wrong token returns 403", () => {
  const { withRead } = createAuthMiddleware(makeRbac());
  const handler = withRead((_req: Request) => Response.json({ ok: true }));
  const res = handler(
    new Request("http://localhost/api/test", { headers: { Authorization: "Bearer bad" } }),
  );
  expect(res.status).toBe(403);
});

// --- withWrite ---

test("withWrite: unauthenticated request returns 401", () => {
  const { withWrite } = createAuthMiddleware(makeRbac());
  const handler = withWrite((_req: Request) => Response.json({ ok: true }));
  const res = handler(new Request("http://localhost/api/test", { method: "POST" }));
  expect(res.status).toBe(401);
});

test("withWrite: read-only token returns 403", () => {
  const { withWrite } = createAuthMiddleware(makeRbac());
  const handler = withWrite((_req: Request) => Response.json({ ok: true }));
  const res = handler(
    new Request("http://localhost/api/test", { method: "POST", headers: readHeaders() }),
  );
  expect(res.status).toBe(403);
});

test("withWrite: write token passes through to handler", async () => {
  const { withWrite } = createAuthMiddleware(makeRbac());
  const handler = withWrite((_req: Request) => Response.json({ ok: true }));
  const res = await handler(
    new Request("http://localhost/api/test", { method: "POST", headers: writeHeaders() }),
  );
  expect(res.status).toBe(200);
});

// --- withPublic ---

test("withPublic: no auth required — request always reaches handler", async () => {
  const { withPublic } = createAuthMiddleware(makeRbac());
  const handler = withPublic((_req: Request) => Response.json({ ok: true }));
  const res = await handler(new Request("http://localhost/api/health"));
  expect(res.status).toBe(200);
});

// --- applyDefaultAuth (close-by-default) ---

test("close-by-default: untagged handler in method map gets read auth applied", () => {
  const { applyDefaultAuth } = createAuthMiddleware(makeRbac());
  const bare = (_req: Request) => Response.json({ secret: "data" });
  const routes = applyDefaultAuth({ "/api/new-route": { GET: bare } }) as Record<
    string,
    Record<string, (r: Request) => Response>
  >;
  const res = routes["/api/new-route"].GET(new Request("http://localhost/api/new-route"));
  expect(res.status).toBe(401);
});

test("close-by-default: untagged plain function handler gets read auth applied", () => {
  const { applyDefaultAuth } = createAuthMiddleware(makeRbac());
  const bare = (_req: Request) => Response.json({ secret: "data" });
  const routes = applyDefaultAuth({ "/api/new-route": bare }) as Record<
    string,
    (r: Request) => Response
  >;
  const res = routes["/api/new-route"](new Request("http://localhost/api/new-route"));
  expect(res.status).toBe(401);
});

test("close-by-default: withPublic tag is preserved through applyDefaultAuth", async () => {
  const { withPublic, applyDefaultAuth } = createAuthMiddleware(makeRbac());
  const pub = withPublic((_req: Request) => Response.json({ ok: true }));
  const routes = applyDefaultAuth({ "/api/health": { GET: pub } }) as Record<
    string,
    Record<string, (r: Request) => Response>
  >;
  const res = await routes["/api/health"].GET(new Request("http://localhost/api/health"));
  expect(res.status).toBe(200);
});

test("close-by-default: withRead tag is preserved through applyDefaultAuth (not double-wrapped)", () => {
  const { withRead, applyDefaultAuth } = createAuthMiddleware(makeRbac());
  const protected_ = withRead((_req: Request) => Response.json({ ok: true }));
  const routes = applyDefaultAuth({ "/api/counter": { GET: protected_ } }) as Record<
    string,
    Record<string, (r: Request) => Response>
  >;
  // no auth → 401 (same as withRead, not double-wrapped to no-op)
  const res = routes["/api/counter"].GET(new Request("http://localhost/api/counter"));
  expect(res.status).toBe(401);
});
