import { currentContext } from "./tracer";

type Level = "info" | "error" | "warn" | "debug";

const RESERVED = new Set(["level", "msg", "ts", "traceId", "spanId"]);

function emit(level: Level, msg: string, ctx?: Record<string, unknown>): void {
  if (ctx) {
    for (const k of Object.keys(ctx)) {
      if (RESERVED.has(k)) throw new Error(`ctx key '${k}' is reserved`);
    }
  }
  const spanCtx = currentContext();
  const traceFields = spanCtx ? { traceId: spanCtx.traceId, spanId: spanCtx.spanId } : {};
  const entry = JSON.stringify({ ...ctx, ...traceFields, level, msg, ts: new Date().toISOString() });
  if (typeof process !== "undefined" && typeof process.stdout?.write === "function") {
    process.stdout.write(entry + "\n");
  } else {
    (level === "error" ? console.error : console.log)(entry);
  }
}

export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
};
