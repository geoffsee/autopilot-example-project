import { timingSafeEqual } from "node:crypto";

export function createAuth(token = process.env.API_TOKEN) {
  const configuredToken = token;

  return function requireAuth(req: Request): Response | null {
    if (!configuredToken) return null;

    const header = req.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const expected = Buffer.from(`Bearer ${configuredToken}`);
    const actual = Buffer.from(header);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return null;
  };
}

export function requireAuth(req: Request): Response | null {
  return createAuth(process.env.API_TOKEN)(req);
}
