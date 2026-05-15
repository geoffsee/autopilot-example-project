import { currentContext } from "./tracer";

type Level = "info" | "error" | "warn" | "debug";

function emit(level: Level, msg: string, ctx?: Record<string, unknown>): void {
  const spanCtx = currentContext();
  const traceFields = spanCtx ? { traceId: spanCtx.traceId, spanId: spanCtx.spanId } : {};
  const entry = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...traceFields, ...ctx });
  if (typeof process !== "undefined" && typeof process.stdout?.write === "function") {
    process.stdout.write(entry + "\n");
  } else {
    (level === "error" ? console.error : console.log)(entry);
  }
}

export const logger = {
  info:  (msg: string, ctx?: Record<string, unknown>) => emit("info",  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => emit("warn",  msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
};
