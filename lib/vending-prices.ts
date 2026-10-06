export function normalizeVendingPrices(prices: Record<string, number> | null | undefined) {
  const normalized = new Map<string, { name: string; amount: number }>();
  Object.entries(prices ?? {}).forEach(([rawName, rawAmount]) => {
    const name = rawName.trim();
    if (!name) return;
    const amount = Number(rawAmount);
    normalized.set(name.toLowerCase(), {
      name,
      amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
    });
  });
  return Object.fromEntries([...normalized.values()].map(({ name, amount }) => [name, amount]));
}

export function setVendingPrice(prices: Record<string, number> | null | undefined, lootName: string, amount: number) {
  const name = lootName.trim();
  const key = name.toLowerCase();
  const next = Object.fromEntries(Object.entries(normalizeVendingPrices(prices)).filter(([candidate]) => candidate.toLowerCase() !== key));
  if (name) next[name] = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return next;
}
