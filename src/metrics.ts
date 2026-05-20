import { Database } from "bun:sqlite";

const requestCounts = new Map<string, number>();

export function trackRequest(route: string, method: string): void {
  const key = `${method}:${route}`;
  requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
}

export function resetRequestCounts(): void {
  requestCounts.clear();
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export function handleMetricsGet(db: Database): Response {
  const lines: string[] = [];

  lines.push("# HELP counter_value Current value of a named counter");
  lines.push("# TYPE counter_value gauge");
  try {
    const counters = db
      .query<{ name: string; value: number }, []>(
        "SELECT name, value FROM counters ORDER BY name"
      )
      .all();
    for (const c of counters) {
      lines.push(`counter_value{name="${escapeLabel(c.name)}"} ${c.value}`);
    }
  } catch {
    // counters table may not exist in minimal test setups
  }

  lines.push("# HELP http_requests_total Total HTTP requests received");
  lines.push("# TYPE http_requests_total counter");
  for (const [key, count] of requestCounts) {
    const colonIdx = key.indexOf(":");
    const method = key.slice(0, colonIdx);
    const route = key.slice(colonIdx + 1);
    lines.push(`http_requests_total{route="${route}",method="${method}"} ${count}`);
  }

  lines.push("# HELP process_uptime_seconds Process uptime in seconds");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${process.uptime()}`);

  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/plain; version=0.0.4" },
  });
}
