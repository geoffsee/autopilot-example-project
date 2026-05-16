import type { PluginFactory } from "./types";
import { signJwt } from "../auth";

const plugin: PluginFactory = (ctx) => ({
  "/api/auth/token": {
    async POST(req: Request) {
      let body: { sub?: unknown; role?: unknown };
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      if (typeof body.sub !== "string" || !body.sub) {
        return Response.json({ error: "sub is required" }, { status: 400 });
      }
      const payload: Record<string, unknown> = { sub: body.sub };
      if (typeof body.role === "string") payload.role = body.role;
      const token = await signJwt(payload, ctx.config.JWT_SECRET);
      return Response.json({ token });
    },
  },
});

export default plugin;
