import { getRuntimeEnv } from "./runtime-env";

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(username: string) {
  const runtime = getRuntimeEnv();
  const secret = runtime.STOICS_SESSION_SECRET ?? runtime.STOICS_MANAGER_PASSWORD ?? "";
  const day = new Date().toISOString().slice(0, 10);
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${username}:${day}`)));
}

export async function isAuthorized(request: Request) {
  const runtime = getRuntimeEnv();
  const cookie = request.headers.get("cookie") ?? "";
  const session = cookie.match(/(?:^|;\s*)stoics_session=([^;]+)/)?.[1];
  const username = runtime.STOICS_MANAGER_USERNAME ?? "stoics-admin";
  if (!session || !runtime.STOICS_MANAGER_PASSWORD) return false;
  return session === (await createSessionToken(username));
}

