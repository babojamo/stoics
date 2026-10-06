import { getRuntimeEnv } from "./runtime-env";

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(username: string) {
  const runtime = getRuntimeEnv();
  const secret = runtime.STOICS_SESSION_SECRET ?? runtime.STOICS_MANAGER_PASSWORD ?? "";
  if (!secret) throw new Error("Session signing is not configured");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const safeUsername = encodeURIComponent(username);
  const signature = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(safeUsername)));
  return `${safeUsername}.${signature}`;
}

export async function getSessionUser(request: Request) {
  const runtime = getRuntimeEnv();
  const cookie = request.headers.get("cookie") ?? "";
  const session = cookie.match(/(?:^|;\s*)stoics_session=([^;]+)/)?.[1];
  if (!session || !(runtime.STOICS_SESSION_SECRET ?? runtime.STOICS_MANAGER_PASSWORD)) return null;
  const separator = session.lastIndexOf(".");
  if (separator < 1) return null;
  let username: string;
  try {
    username = decodeURIComponent(session.slice(0, separator));
  } catch {
    return null;
  }
  return session === (await createSessionToken(username)) ? username : null;
}

export async function isAuthorized(request: Request) {
  return Boolean(await getSessionUser(request));
}

