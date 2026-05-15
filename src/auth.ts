function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(pad));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function encodeJson(value: unknown): string {
  return base64urlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

async function hmacSha256Sign(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return base64urlEncode(new Uint8Array(sig));
}

async function hmacSha256Verify(input: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = base64urlDecode(signature);
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(input));
}

const HEADER = encodeJson({ alg: "HS256", typ: "JWT" });

export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds = 3600
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };
  const payloadB64 = encodeJson(fullPayload);
  const signingInput = `${HEADER}.${payloadB64}`;
  const signature = await hmacSha256Sign(signingInput, secret);
  return `${signingInput}.${signature}`;
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT: expected three parts");

  const [header, payloadB64, signature] = parts as [string, string, string];
  const signingInput = `${header}.${payloadB64}`;

  const valid = await hmacSha256Verify(signingInput, signature, secret);
  if (!valid) throw new Error("Invalid JWT: signature mismatch");

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as Record<string, unknown>;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) {
    throw new Error("JWT expired");
  }

  return payload;
}

export function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}
