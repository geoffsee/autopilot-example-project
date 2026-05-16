import type { PluginFactory } from "./types";
import { signJwt } from "../auth";

const plugin: PluginFactory = (ctx) => ({
  "/api/auth/token": {
    async POST() {
      const token = await signJwt({ sub: "user" }, ctx.config.JWT_SECRET);
      return Response.json({ token });
    },
  },
});

export default plugin;
