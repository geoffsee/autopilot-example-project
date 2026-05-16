import type { Server } from "bun";
import type { PluginFactory } from "./types";
import { getNamedCount, incrementNamedCounter } from "../counter";
import { logActivity } from "../activity";
import { extractBearer, verifyJwt } from "../auth";
import { withSpan } from "../tracer";

const plugin: PluginFactory = (ctx) => ({
  "/api/counter/:name": {
    async GET(req: Request & { params: Record<string, string> }) {
      return withSpan("GET /api/counter/:name", async () =>
        Response.json({ count: getNamedCount(ctx.db, req.params.name) })
      );
    },
    async POST(req: Request & { params: Record<string, string> }, server: Server) {
      return withSpan("POST /api/counter/:name", async () => {
        const bearer = extractBearer(req);
        if (!bearer) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        try {
          await verifyJwt(bearer, ctx.config.JWT_SECRET);
        } catch {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const count = incrementNamedCounter(ctx.db, req.params.name);
        server.publish("counter", JSON.stringify({ type: "counter", name: req.params.name, count }));
        const entry = logActivity(ctx.db, `counter.increment.${req.params.name}`);
        server.publish("activity", JSON.stringify({ type: "activity", entry }));
        return Response.json({ count });
      });
    },
  },
});

export default plugin;
