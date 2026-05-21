export function createAuth(token = process.env.API_TOKEN) {
  const configuredToken = token || undefined;

  return function requireAuth(req: Request): Response | null {
    if (!configuredToken) return null;

    const header = req.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (header !== `Bearer ${configuredToken}`) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return null;
  };
}

export const requireAuth = createAuth();
