import { createSessionToken } from "../../../../lib/auth-server";
import { getRuntimeEnv } from "../../../../lib/runtime-env";

export async function POST(request: Request) {
  const runtime = getRuntimeEnv();
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = runtime.STOICS_MANAGER_USERNAME ?? "stoics-admin";
  const password = runtime.STOICS_MANAGER_PASSWORD;
  if (!password) return Response.json({ error: "Manager password is not configured." }, { status: 503 });
  if (body.username !== username || body.password !== password) {
    return Response.json({ error: "Username or password is incorrect." }, { status: 401 });
  }
  const token = await createSessionToken(username);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(JSON.stringify({ ok: true, username }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `stoics_session=${token}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=86400`,
    },
  });
}

