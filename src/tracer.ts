import { AsyncLocalStorage } from "node:async_hooks";

export type SpanContext = {
  traceId: string;
  spanId: string;
};

const storage = new AsyncLocalStorage<SpanContext>();

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function currentContext(): SpanContext | undefined {
  return storage.getStore();
}

export function initTracer(): void {
  const entry = JSON.stringify({
    level: "info",
    msg: "tracer initialized",
    ts: new Date().toISOString(),
    exporter: "stdout-otlp-json",
  });
  process.stdout.write(entry + "\n");
}

type SpanAttributes = Record<string, string | number | boolean>;

export async function withSpan<T>(
  name: string,
  fn: (ctx: SpanContext) => Promise<T>,
  attributes?: SpanAttributes,
  kind: number = 2,
): Promise<T> {
  const parent = storage.getStore();
  const traceId = parent?.traceId ?? randomHex(16);
  const spanId = randomHex(8);
  const ctx: SpanContext = { traceId, spanId };

  const startTimeMs = Date.now();
  const startPerf = performance.now();
  let status: "OK" | "ERROR" = "OK";

  try {
    return await storage.run(ctx, () => fn(ctx));
  } catch (err) {
    status = "ERROR";
    throw err;
  } finally {
    const durationMs = performance.now() - startPerf;
    emitSpan({ name, traceId, spanId, parentSpanId: parent?.spanId, startTimeMs, durationMs, status, attributes, kind });
  }
}

type SpanRecord = {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTimeMs: number;
  durationMs: number;
  status: "OK" | "ERROR";
  attributes?: SpanAttributes;
  kind: number;
};

let spanEmitter: ((chunk: string) => void) | null = (chunk: string) => process.stdout.write(chunk);

export function setSpanEmitter(fn: ((chunk: string) => void) | null): void {
  spanEmitter = fn;
}

function emitSpan(span: SpanRecord): void {
  if (!spanEmitter) return;

  const startNs = (BigInt(span.startTimeMs) * 1_000_000n).toString();
  const endNs = (BigInt(span.startTimeMs) * 1_000_000n + BigInt(Math.round(span.durationMs * 1_000_000))).toString();

  const otlp = {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: "autopilot-example-project" } }],
        },
        scopeSpans: [
          {
            scope: { name: "autopilot-example-project", version: "0.1.0" },
            spans: [
              {
                traceId: span.traceId,
                spanId: span.spanId,
                ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
                name: span.name,
                kind: span.kind,
                startTimeUnixNano: startNs,
                endTimeUnixNano: endNs,
                attributes: Object.entries(span.attributes ?? {}).map(([k, v]) => ({
                  key: k,
                  value:
                    typeof v === "number"
                      ? { intValue: v }
                      : typeof v === "boolean"
                        ? { boolValue: v }
                        : { stringValue: String(v) },
                })),
                status: { code: span.status === "OK" ? 1 : 2 },
              },
            ],
          },
        ],
      },
    ],
  };

  spanEmitter(JSON.stringify(otlp) + "\n");
}
