import type { LootState } from "../../../lib/types";
import { getRuntimeEnv } from "../../../lib/runtime-env";

function supabaseHeaders() {
  const key = getRuntimeEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function vendingPriceFor(state: LootState, lootName: string) {
  const match = Object.entries(state.vendingPrices ?? {}).find(
    ([name]) => name.trim().toLowerCase() === lootName.trim().toLowerCase(),
  );
  return Number(match?.[1] ?? 0);
}

export async function GET() {
  const runtime = getRuntimeEnv();
  const url = (runtime.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = runtime.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  if (!url || !key) {
    return Response.json({ error: "The public shop is unavailable." }, { status: 503 });
  }

  const response = await fetch(`${url}/rest/v1/rpc/get_stoics_loot_state`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: "{}",
    cache: "no-store",
  });

  if (!response.ok) {
    return Response.json({ error: "The public shop is unavailable." }, { status: 503 });
  }

  const state = await response.json() as LootState;
  const inventory = new Map<string, { name: string; collected: number; sold: number }>();

  state.runs.forEach((run) => run.loots.forEach((loot) => {
    const lootKey = loot.name.trim().toLowerCase();
    const item = inventory.get(lootKey) ?? { name: loot.name.trim(), collected: 0, sold: 0 };
    item.collected += Number(loot.quantity);
    inventory.set(lootKey, item);
  }));

  state.sales.forEach((sale) => {
    const item = inventory.get(sale.lootName.trim().toLowerCase());
    if (item) item.sold += Number(sale.quantity);
  });

  const items = [...inventory.values()]
    .map((item) => ({
      name: item.name,
      vendingPrice: vendingPriceFor(state, item.name),
      available: Math.max(0, item.collected - item.sold),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return Response.json(
    { items, updatedAt: state.lastUpdatedAt ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
