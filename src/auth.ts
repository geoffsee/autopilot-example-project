export function checkBearerAuth(req: Request, token: string): Response | null {
  const auth = req.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${token}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function requireAuth(req: Request): Response | null {
  const token = process.env.API_TOKEN;
  if (!token) return null;
  return checkBearerAuth(req, token);
}
