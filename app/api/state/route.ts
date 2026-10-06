import { isAuthorized } from "../../../lib/auth-server";
import { defaultState } from "../../../lib/default-state";
import type { LootState } from "../../../lib/types";
import { getRuntimeEnv } from "../../../lib/runtime-env";

const rowId = "guild";

function supabaseHeaders() {
  const key = getRuntimeEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function config() {
  const runtime = getRuntimeEnv();
  return {
    url: (runtime.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, ""),
    key: runtime.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { url, key } = config();
  if (!url || !key) return Response.json({ state: defaultState, connected: false, reason: "Supabase is not configured." });
  const response = await fetch(`${url}/rest/v1/stoics_loot_state?id=eq.${rowId}&select=payload`, { headers: supabaseHeaders(), cache: "no-store" });
  if (!response.ok) {
    return Response.json({ state: defaultState, connected: false, reason: "Run the included supabase-schema.sql once to enable cloud saving." });
  }
  const rows = (await response.json()) as Array<{ payload: LootState }>;
  return Response.json({ state: rows[0]?.payload ?? defaultState, connected: true });
}

export async function PUT(request: Request) {
  if (!(await isAuthorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const state = (await request.json()) as LootState;
  const { url, key } = config();
  if (!url || !key) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const response = await fetch(`${url}/rest/v1/stoics_loot_state`, {
    method: "POST",
    headers: { ...supabaseHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: rowId, payload: state, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) return Response.json({ error: "Cloud save is unavailable. Run supabase-schema.sql in Supabase." }, { status: 503 });
  return Response.json({ ok: true });
}

