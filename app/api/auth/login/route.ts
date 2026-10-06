import { createSessionToken } from "../../../../lib/auth-server";
import { getRuntimeEnv } from "../../../../lib/runtime-env";

export async function POST(request: Request) {
  const runtime = getRuntimeEnv();
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = body.username?.trim() ?? "";
  if (username.length < 2 || username.length > 32) {
    return Response.json({ error: "Enter a username between 2 and 32 characters." }, { status: 400 });
  }
  if (!body.password) return Response.json({ error: "Enter your password." }, { status: 400 });
  if (!(runtime.STOICS_SESSION_SECRET ?? runtime.STOICS_MANAGER_PASSWORD)) {
    return Response.json({ error: "Session signing is not configured." }, { status: 503 });
  }

  const supabaseUrl = (runtime.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const supabaseKey = runtime.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  let authenticatedUsername = "";
  let databaseAuthAvailable = false;

  if (supabaseUrl && supabaseKey) {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/authenticate_stoics_manager`, {
      method: "POST",
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_username: username, p_password: body.password }),
      cache: "no-store",
    });
    if (response.ok) {
      databaseAuthAvailable = true;
      const result = await response.json() as { authenticated?: boolean; configured?: boolean; username?: string };
      if (result.authenticated) authenticatedUsername = result.username?.trim() || username;
      else if (result.configured === false) {
        return Response.json({ error: "No manager account is configured. Run the manager-account setup SQL first." }, { status: 503 });
      } else return Response.json({ error: "Username or password is incorrect." }, { status: 401 });
    } else {
      const detail = await response.clone().text();
      const missingFunction = response.status === 404 || detail.includes("PGRST202") || detail.includes("Could not find the function");
      if (!missingFunction) return Response.json({ error: "Manager login is temporarily unavailable." }, { status: 503 });
    }
  }

  if (!databaseAuthAvailable) {
    const fallbackPassword = runtime.STOICS_MANAGER_PASSWORD;
    if (!fallbackPassword) return Response.json({ error: "Database manager login is not configured." }, { status: 503 });
    if (body.password !== fallbackPassword) return Response.json({ error: "Username or password is incorrect." }, { status: 401 });
    authenticatedUsername = username;
  }

  const token = await createSessionToken(authenticatedUsername);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(JSON.stringify({ ok: true, username: authenticatedUsername }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `stoics_session=${token}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=604800`,
    },
  });
}

