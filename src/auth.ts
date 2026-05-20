import { timingSafeEqual } from "crypto";

export function checkBearerAuth(req: Request, token: string): Response | null {
  const auth = req.headers.get("Authorization");
  if (!auth) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(auth);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }
  return null;
}

export function requireAuth(req: Request): Response | null {
  const token = process.env.API_TOKEN;
  if (!token) {
    return Response.json({ error: "server misconfiguration" }, { status: 500 });
  }
  return checkBearerAuth(req, token);
}
