import { getSessionUser } from "../../../lib/auth-server";
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

function normalizeState(value: Partial<LootState> | null | undefined): LootState {
  return {
    members: value?.members ?? [],
    runs: value?.runs ?? [],
    sales: value?.sales ?? [],
    payoutQueue: value?.payoutQueue ?? [],
    auditLog: value?.auditLog ?? [],
    lastUpdatedBy: value?.lastUpdatedBy,
    lastUpdatedAt: value?.lastUpdatedAt,
  };
}

async function rpcIsMissing(response: Response) {
  if (response.status === 404) return true;
  const body = await response.clone().text();
  return body.includes("PGRST202") || body.includes("Could not find the function");
}

async function readLegacyState(url: string) {
  const response = await fetch(`${url}/rest/v1/stoics_loot_state?id=eq.${rowId}&select=payload`, { headers: supabaseHeaders(), cache: "no-store" });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ payload: LootState }>;
  return normalizeState(rows[0]?.payload ?? defaultState);
}

export async function GET(request: Request) {
  if (!(await getSessionUser(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { url, key } = config();
  if (!url || !key) return Response.json({ state: defaultState, connected: false, reason: "Supabase is not configured." });
  const response = await fetch(`${url}/rest/v1/rpc/get_stoics_loot_state`, {
    method: "POST", headers: supabaseHeaders(), body: "{}", cache: "no-store",
  });
  if (response.ok) return Response.json({ state: normalizeState((await response.json()) as LootState), connected: true });
  if (await rpcIsMissing(response)) {
    const legacy = await readLegacyState(url);
    if (legacy) return Response.json({ state: legacy, connected: true, legacy: true });
  }
  return Response.json({ state: defaultState, connected: false, reason: "Run the included relational supabase-schema.sql once to enable cloud saving." });
}

export async function PUT(request: Request) {
  const username = await getSessionUser(request);
  if (!username) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const state = (await request.json()) as LootState;
  state.lastUpdatedBy = username;
  state.lastUpdatedAt = new Date().toISOString();
  if (state.auditLog?.[0]) state.auditLog[0].username = username;
  const { url, key } = config();
  if (!url || !key) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const response = await fetch(`${url}/rest/v1/rpc/save_stoics_loot_state`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({ p_state: state, p_actor: username }),
  });
  if (response.ok) return Response.json({ ok: true });
  if (await rpcIsMissing(response)) {
    const legacyResponse = await fetch(`${url}/rest/v1/stoics_loot_state`, {
      method: "POST",
      headers: { ...supabaseHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: rowId, payload: state, updated_at: new Date().toISOString() }),
    });
    if (legacyResponse.ok) return Response.json({ ok: true, legacy: true });
  }
  return Response.json({ error: "Cloud save is unavailable. Run the relational supabase-schema.sql in Supabase." }, { status: 503 });
}

