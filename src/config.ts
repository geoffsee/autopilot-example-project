const VALID_NODE_ENVS = ["development", "production", "test"] as const;
type NodeEnv = (typeof VALID_NODE_ENVS)[number];

type RawEnv = Record<string, string | undefined>;

export function buildConfig(env: RawEnv = process.env) {
  const nodeEnvRaw = env.NODE_ENV ?? "development";
  if (!(VALID_NODE_ENVS as readonly string[]).includes(nodeEnvRaw)) {
    throw new Error(
      `Invalid NODE_ENV: "${nodeEnvRaw}". Must be one of: ${VALID_NODE_ENVS.join(", ")}`
    );
  }
  const NODE_ENV = nodeEnvRaw as NodeEnv;
  return {
    NODE_ENV,
    isDevelopment: NODE_ENV !== "production",
  } as const;
}

export const config = buildConfig();
