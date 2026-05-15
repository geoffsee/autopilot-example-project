import indexHtml from "../index.html";
import type { PluginFactory } from "./types";

const plugin: PluginFactory = (_ctx) => ({
  "/*": indexHtml,
});

export default plugin;
