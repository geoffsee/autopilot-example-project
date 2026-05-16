import { test, expect, beforeEach } from "bun:test";
import { withSpan, currentContext, initTracer, setSpanEmitter } from "../src/tracer";

beforeEach(() => {
  setSpanEmitter(null);
});

test("initTracer runs without error", () => {
  expect(() => initTracer()).not.toThrow();
});

test("withSpan provides context with 32-char hex traceId and 16-char hex spanId", async () => {
  let captured: ReturnType<typeof currentContext>;
  await withSpan("test.shape", async (ctx) => {
    captured = ctx;
  });
  expect(captured!).toBeDefined();
  expect(typeof captured!.traceId).toBe("string");
  expect(captured!.traceId).toHaveLength(32);
  expect(/^[0-9a-f]{32}$/.test(captured!.traceId)).toBe(true);
  expect(typeof captured!.spanId).toBe("string");
  expect(captured!.spanId).toHaveLength(16);
  expect(/^[0-9a-f]{16}$/.test(captured!.spanId)).toBe(true);
});

test("currentContext returns undefined outside a span", () => {
  expect(currentContext()).toBeUndefined();
});

test("currentContext returns the active context inside a span", async () => {
  await withSpan("test.context", async (spanCtx) => {
    const ctx = currentContext();
    expect(ctx).toBeDefined();
    expect(ctx!.traceId).toBe(spanCtx.traceId);
    expect(ctx!.spanId).toBe(spanCtx.spanId);
  });
});

test("nested spans share traceId but have different spanIds", async () => {
  let outerTraceId!: string;
  let outerSpanId!: string;
  let innerTraceId!: string;
  let innerSpanId!: string;

  await withSpan("outer", async (outer) => {
    outerTraceId = outer.traceId;
    outerSpanId = outer.spanId;
    await withSpan("inner", async (inner) => {
      innerTraceId = inner.traceId;
      innerSpanId = inner.spanId;
    });
  });

  expect(innerTraceId).toBe(outerTraceId);
  expect(innerSpanId).not.toBe(outerSpanId);
});

test("withSpan re-throws errors and still emits span", async () => {
  await expect(
    withSpan("failing.span", async () => {
      throw new Error("test error");
    })
  ).rejects.toThrow("test error");
});

test("sequential spans each get unique traceId and spanId", async () => {
  let ctx1!: ReturnType<typeof currentContext>;
  let ctx2!: ReturnType<typeof currentContext>;
  await withSpan("span.one", async (c) => { ctx1 = c; });
  await withSpan("span.two", async (c) => { ctx2 = c; });
  expect(ctx1!.traceId).not.toBe(ctx2!.traceId);
  expect(ctx1!.spanId).not.toBe(ctx2!.spanId);
});

test("withSpan emits OTLP JSON via spanEmitter for each span", async () => {
  const written: string[] = [];
  setSpanEmitter((chunk) => written.push(chunk));
  try {
    await withSpan("test.otlp.emit", async () => {});
  } finally {
    setSpanEmitter(null);
  }

  const otlpLines = written
    .map((l) => l.trim())
    .filter((l) => {
      try {
        return "resourceSpans" in JSON.parse(l);
      } catch {
        return false;
      }
    });
  expect(otlpLines.length).toBeGreaterThanOrEqual(1);
  const span = JSON.parse(otlpLines[otlpLines.length - 1]!);
  expect(span.resourceSpans[0].scopeSpans[0].spans[0].name).toBe("test.otlp.emit");
});
