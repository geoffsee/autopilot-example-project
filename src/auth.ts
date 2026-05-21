const configuredToken = process.env.API_TOKEN;

export function requireAuth(req: Request): Response | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (configuredToken && header !== `Bearer ${configuredToken}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
