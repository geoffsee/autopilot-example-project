type HttpMethod = "get" | "put" | "post" | "delete" | "patch";

type RouteEntry = {
  path: string;
  method: HttpMethod;
  summary: string;
  description?: string;
};

// Bun uses :param syntax; OpenAPI uses {param}
function toOpenApiPath(bunPath: string): string {
  return bunPath.replace(/:([^/]+)/g, "{$1}");
}

// Keep in sync with routes declared in src/index.ts.
// Tests only verify that listed paths/methods appear in the spec output; they
// do not detect routes added to index.ts but omitted from this manifest.
const ROUTE_MANIFEST: RouteEntry[] = [
  { path: "/api/hello", method: "get", summary: "Return a hello greeting" },
  { path: "/api/hello", method: "put", summary: "Return a hello greeting via PUT" },
  { path: "/api/hello/:name", method: "get", summary: "Return a personalised greeting" },
  { path: "/api/counter", method: "get", summary: "Get the current counter value" },
  { path: "/api/counter", method: "post", summary: "Increment the counter" },
  { path: "/api/activity", method: "get", summary: "Get recent activity entries" },
  { path: "/api/spec", method: "get", summary: "Get the OpenAPI 3.1 specification" },
];

export type OpenApiDoc = {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Partial<Record<HttpMethod, { summary: string; responses: Record<string, { description: string }> }>>>;
};

function buildSpec(): OpenApiDoc {
  const paths: OpenApiDoc["paths"] = {};

  for (const entry of ROUTE_MANIFEST) {
    const openApiPath = toOpenApiPath(entry.path);
    if (!paths[openApiPath]) paths[openApiPath] = {};
    paths[openApiPath][entry.method] = {
      summary: entry.summary,
      responses: { "200": { description: "OK" } },
    };
  }

  return {
    openapi: "3.1.0",
    info: { title: "Autopilot Example API", version: "0.1.0" },
    paths,
  };
}

export const SPEC: OpenApiDoc = buildSpec();
