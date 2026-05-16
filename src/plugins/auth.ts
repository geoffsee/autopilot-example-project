import type { PluginFactory } from "./types";
import { signJwt } from "../auth";

const plugin: PluginFactory = (ctx) => ({
  "/api/auth/token": {
    async POST() {
      // Demo stub: issues a signed JWT to any caller with no credential check.
      const token = await signJwt({ sub: "user" }, ctx.config.JWT_SECRET);
      return Response.json({ token });
    },
  },
});

export default plugin;
