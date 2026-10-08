import type { DungeonRun, LootState, RunLoot, Sale } from "./types";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function memberNames(state: LootState, ids: string[]) {
  const names = new Map(state.members.map((member) => [member.id, member.name]));
  return ids.map((id) => names.get(id) ?? `Unknown member (${id})`).join(", ") || "None";
}

function lootList(loots: RunLoot[]) {
  return loots.map((loot) => `${loot.quantity} × ${loot.name}`).join(", ") || "None";
}

function runDetails(run: DungeonRun, state: LootState) {
  return [
    `Dungeon: ${run.dungeon}`,
    `Run date: ${run.createdAt}`,
    `Members: ${memberNames(state, run.memberIds)}`,
    `Loot: ${lootList(run.loots)}`,
  ];
}

function runChanges(before: DungeonRun, after: DungeonRun, previous: LootState, next: LootState) {
  const changes: string[] = [];
  if (before.dungeon !== after.dungeon) changes.push(`Dungeon: ${before.dungeon} → ${after.dungeon}`);
  if (before.createdAt !== after.createdAt) changes.push(`Run date: ${before.createdAt} → ${after.createdAt}`);
  const oldMembers = memberNames(previous, before.memberIds);
  const newMembers = memberNames(next, after.memberIds);
  if (oldMembers !== newMembers) changes.push(`Members: ${oldMembers} → ${newMembers}`);
  const oldLoot = lootList(before.loots);
  const newLoot = lootList(after.loots);
  if (oldLoot !== newLoot) changes.push(`Loot: ${oldLoot} → ${newLoot}`);
  return changes;
}

function saleDetails(sale: Sale, state: LootState) {
  const names = new Map(state.members.map((member) => [member.id, member.name]));
  const payouts = sale.recipientIds.map((id) =>
    `• ${names.get(id) ?? `Unknown member (${id})`}: ${amount.format(sale.recipientAmounts?.[id] ?? sale.salaryEach)} Penya`
  );
  return [
    `Loot: ${sale.lootName}`,
    `Sold: ${sale.quantity} × ${amount.format(sale.unitPrice)} Penya`,
    `Total sale: ${amount.format(sale.total)} Penya`,
    "Salaries paid:",
    ...payouts,
  ];
}

function availableLoot(state: LootState, lootName: string) {
  const key = lootName.trim().toLowerCase();
  const collected = state.runs.reduce((total, run) => total + run.loots.reduce((sum, loot) =>
    sum + (loot.name.trim().toLowerCase() === key ? loot.quantity : 0), 0), 0);
  const sold = state.sales.reduce((total, sale) => total + (sale.lootName.trim().toLowerCase() === key ? sale.quantity : 0), 0);
  return collected - sold;
}

export function auditMessages(previous: LootState, next: LootState, actor: string) {
  const messages: string[][] = [];
  const oldRuns = new Map(previous.runs.map((run) => [run.id, run]));
  for (const run of next.runs) {
    const before = oldRuns.get(run.id);
    if (!before) {
      messages.push([`**Dungeon run created** by ${actor}`, ...runDetails(run, next)]);
      continue;
    }
    const changes = runChanges(before, run, previous, next);
    if (changes.length) messages.push([`**Dungeon run updated** by ${actor}`, ...runDetails(run, next), "Changes:", ...changes.map((change) => `• ${change}`)]);
  }

  const oldSaleIds = new Set(previous.sales.map((sale) => sale.id));
  for (const sale of next.sales) {
    if (!oldSaleIds.has(sale.id)) messages.push([`**Sale recorded and salaries paid** by ${actor}`, ...saleDetails(sale, next)]);
  }

  const oldPrices = new Map(Object.entries(previous.vendingPrices).map(([name, price]) => [name.trim().toLowerCase(), price]));
  for (const [name, price] of Object.entries(next.vendingPrices)) {
    const before = oldPrices.get(name.trim().toLowerCase()) ?? 0;
    if (Number(before) !== Number(price)) {
      messages.push([
        `**Vending amount changed** by ${actor}`,
        `Loot: ${name}`,
        `Amount: ${amount.format(before)} → ${amount.format(price)} Penya`,
        `Available: ${availableLoot(next, name)} units`,
      ]);
    }
  }
  return messages;
}

function chunks(lines: string[]) {
  const result: string[] = [];
  let current = "";
  for (const line of lines) {
    // Discord content is limited to 2,000 characters. Keep room for part labels.
    const segments = line.match(/.{1,1700}/gu) ?? [""];
    for (const segment of segments) {
      if (current && current.length + segment.length + 1 > 1800) {
        result.push(current);
        current = "";
      }
      current += `${current ? "\n" : ""}${segment}`;
    }
  }
  if (current) result.push(current);
  return result;
}

export async function postDiscordAudit(webhookUrl: string, messages: string[][]) {
  for (const lines of messages) {
    const parts = chunks(lines);
    for (const [index, content] of parts.entries()) {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: parts.length > 1 ? `${content}\n(Part ${index + 1}/${parts.length})` : content,
          allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Discord webhook returned ${response.status}`);
    }
  }
}
