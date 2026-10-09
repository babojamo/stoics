"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BarChart3,
  Check,
  ChevronRight,
  Coins,
  Copy,
  Gem,
  ImagePlus,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  LogOut,
  Menu,
  PackageOpen,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { defaultState } from "../../lib/default-state";
import type { DungeonRun, LootState, Member, RunLoot, Sale } from "../../lib/types";
import { normalizeVendingPrices, setVendingPrice } from "../../lib/vending-prices";
import { lootImageFor, normalizeLootImages, setLootImage } from "../../lib/loot-images";
import { resolveRunParty } from "../../lib/run-party";
import { PenyaAmount, PenyaCoin } from "./penya";
import { FeaturedMembers } from "./featured-members";

type Tab = "dashboard" | "runs" | "inventory" | "settlements" | "statistics" | "search";
const tabPaths: Record<Tab, string> = {
  dashboard: "/overview",
  runs: "/dungeon-runs",
  inventory: "/loot-inventory",
  settlements: "/sales",
  statistics: "/statistics",
  search: "/member-search",
};
const pathTabs = Object.fromEntries(Object.entries(tabPaths).map(([tab, path]) => [path, tab])) as Record<string, Tab>;
type Flash = { type: "good" | "warn"; text: string } | null;

const plainAmount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const lootQuantityAmount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const compactMailAmount = (value: number) => {
  const divisor = value >= 1_000_000_000 ? 1_000_000_000 : value >= 1_000_000 ? 1_000_000 : 1_000;
  const suffix = value >= 1_000_000_000 ? "B" : value >= 1_000_000 ? "M" : "K";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value / divisor)}${suffix}`;
};
const dateTime = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const makeId = () => crypto.randomUUID();
const cloneSeed = () => JSON.parse(JSON.stringify(defaultState)) as LootState;
const localDateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function vendingPriceFor(state: LootState, lootName: string) {
  const match = Object.entries(state.vendingPrices ?? {}).find(([name]) => name.trim().toLowerCase() === lootName.trim().toLowerCase());
  return Number(match?.[1] ?? 0);
}

function inventoryFor(state: LootState) {
  const map = new Map<string, { name: string; collected: number; sold: number; available: number; runIds: string[] }>();
  state.runs.forEach((run) => run.loots.forEach((loot) => {
    const key = loot.name.trim().toLowerCase();
    const row = map.get(key) ?? { name: loot.name.trim(), collected: 0, sold: 0, available: 0, runIds: [] };
    row.collected += loot.quantity;
    row.runIds.push(run.id);
    map.set(key, row);
  }));
  state.sales.forEach((sale) => {
    const row = map.get(sale.lootName.trim().toLowerCase());
    if (row) row.sold += sale.quantity;
  });
  return [...map.values()].map((row) => ({ ...row, available: row.collected - row.sold, vendingAmount: vendingPriceFor(state, row.name), image: lootImageFor(state.lootImages, row.name) })).sort((a, b) => b.available - a.available);
}

async function resizeLootPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("This browser could not prepare the image."); }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = canvas.toDataURL("image/webp", 0.82);
  if (image.length > 700_000) throw new Error("The prepared image is still too large. Try a smaller photo.");
  return image;
}

type ResolvedSaleAllocation = { runLootId: string; quantity: number };

function resolveSaleAllocations(state: LootState) {
  const lots = state.runs.flatMap((run) => run.loots.map((loot) => ({
    run,
    loot,
    remaining: loot.quantity,
  })));
  const lotById = new Map(lots.map((lot) => [lot.loot.id, lot]));
  const allocationsBySale = new Map<string, ResolvedSaleAllocation[]>();
  const recipientOverlap = (sale: Sale, run: DungeonRun) => {
    const recipients = new Set(sale.recipientIds);
    return run.memberIds.reduce((total, memberId) => total + (recipients.has(memberId) ? 1 : 0), 0);
  };

  [...state.sales]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .forEach((sale) => {
      const lootKey = sale.lootName.trim().toLowerCase();
      let requested = Math.max(0, sale.quantity);
      const resolved: ResolvedSaleAllocation[] = [];
      const candidates = () => lots.filter((lot) => lot.remaining > 0 && lot.loot.name.trim().toLowerCase() === lootKey);
      const bestOverlap = () => candidates().reduce((best, lot) => Math.max(best, recipientOverlap(sale, lot.run)), 0);

      for (const allocation of sale.allocations ?? []) {
        const lot = lotById.get(allocation.runLootId);
        if (!lot || lot.remaining <= 0 || lot.loot.name.trim().toLowerCase() !== lootKey || requested <= 0) continue;
        // Older database allocations were date-based. Ignore a zero-party match when
        // another unsold run contains the members who were actually paid.
        if (recipientOverlap(sale, lot.run) === 0 && bestOverlap() > 0) continue;
        const quantity = Math.min(requested, lot.remaining, Math.max(0, allocation.quantity));
        if (quantity <= 0) continue;
        resolved.push({ runLootId: lot.loot.id, quantity });
        lot.remaining -= quantity;
        requested -= quantity;
      }

      const fallbackLots = candidates().sort((left, right) => {
        const overlapDifference = recipientOverlap(sale, right.run) - recipientOverlap(sale, left.run);
        if (overlapDifference !== 0) return overlapDifference;
        return new Date(left.run.createdAt).getTime() - new Date(right.run.createdAt).getTime();
      });
      for (const lot of fallbackLots) {
        if (requested <= 0) break;
        const quantity = Math.min(requested, lot.remaining);
        if (quantity <= 0) continue;
        resolved.push({ runLootId: lot.loot.id, quantity });
        lot.remaining -= quantity;
        requested -= quantity;
      }
      allocationsBySale.set(sale.id, resolved);
    });

  return allocationsBySale;
}

function soldQuantitiesByRunLoot(state: LootState) {
  const soldByLoot = new Map<string, number>();
  const runIdByLootId = new Map(state.runs.flatMap((run) => run.loots.map((loot) => [loot.id, run.id] as const)));
  for (const allocations of resolveSaleAllocations(state).values()) {
    allocations.forEach((allocation) => {
      const runId = runIdByLootId.get(allocation.runLootId);
      if (!runId) return;
      const key = `${runId}:${allocation.runLootId}`;
      soldByLoot.set(key, (soldByLoot.get(key) ?? 0) + allocation.quantity);
    });
  }
  return soldByLoot;
}

function withResolvedSaleAllocations(state: LootState): LootState {
  const resolved = resolveSaleAllocations(state);
  return { ...state, sales: state.sales.map((sale) => ({ ...sale, allocations: resolved.get(sale.id) ?? [] })) };
}

function currentPayoutQueue(state: LootState) {
  const soldByLoot = soldQuantitiesByRunLoot(state);
  const activeIds = new Set(state.members.filter((member) => member.active).map((member) => member.id));
  const eligibleIds = new Set(state.runs
    .filter((run) => run.loots.some((loot) => (soldByLoot.get(`${run.id}:${loot.id}`) ?? 0) < loot.quantity))
    .flatMap((run) => run.memberIds)
    .filter((id) => activeIds.has(id)));
  const ordered = [
    ...state.payoutQueue.filter((id) => eligibleIds.has(id)),
    ...state.runs.flatMap((run) => run.memberIds).filter((id) => eligibleIds.has(id) && !state.payoutQueue.includes(id)),
  ];
  return ordered.filter((id, index) => ordered.indexOf(id) === index);
}

function pendingLootByMember(state: LootState) {
  const soldByLoot = soldQuantitiesByRunLoot(state);
  const pending = new Map<string, Map<string, { name: string; quantity: number }>>();
  state.runs.forEach((run) => run.loots.forEach((loot) => {
    const quantity = loot.quantity - (soldByLoot.get(`${run.id}:${loot.id}`) ?? 0);
    if (quantity <= 0) return;
    run.memberIds.forEach((memberId) => {
      const memberLoot = pending.get(memberId) ?? new Map<string, { name: string; quantity: number }>();
      const key = loot.name.trim().toLowerCase();
      const current = memberLoot.get(key) ?? { name: loot.name.trim(), quantity: 0 };
      current.quantity += quantity;
      memberLoot.set(key, current);
      pending.set(memberId, memberLoot);
    });
  }));
  return new Map([...pending].map(([memberId, loots]) => [memberId, [...loots.values()]
    .map((loot) => `${loot.quantity} ${loot.name}${loot.quantity === 1 || /s$/i.test(loot.name) ? "" : "s"} pending`)
    .join(" · ")]));
}

function contributingLotsForSale(state: LootState, lootName: string, quantity: number) {
  const key = lootName.trim().toLowerCase();
  const soldByLoot = soldQuantitiesByRunLoot(state);
  let requested = Math.max(0, quantity);
  const contributions: Array<{ run: DungeonRun; runLootId: string; quantity: number }> = [];
  const lots = [...state.runs]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .flatMap((run) => run.loots
      .filter((loot) => loot.name.trim().toLowerCase() === key)
      .map((loot) => ({ run, runLootId: loot.id, available: loot.quantity - (soldByLoot.get(`${run.id}:${loot.id}`) ?? 0) })));

  for (const lot of lots) {
    if (lot.available <= 0 || requested <= 0) continue;
    const soldFromLot = Math.min(requested, lot.available);
    contributions.push({ run: lot.run, runLootId: lot.runLootId, quantity: soldFromLot });
    requested -= soldFromLot;
  }

  return contributions;
}

function eligibleMembersForSale(state: LootState, lootName: string, quantity: number) {
  const contributingMembers = new Set(contributingLotsForSale(state, lootName, quantity).flatMap((lot) => lot.run.memberIds));
  const payoutQueue = currentPayoutQueue(state);

  const activeEligible = state.members
    .filter((member) => member.active && contributingMembers.has(member.id))
    .map((member) => member.id);
  return [
    ...payoutQueue.filter((id) => activeEligible.includes(id)),
    ...activeEligible.filter((id) => !payoutQueue.includes(id)),
  ];
}

function salaryBreakdownForSale(state: LootState, lootName: string, quantity: number, unitPrice: number, recipientIds: string[]) {
  const selected = new Set(recipientIds);
  const payoutQueue = currentPayoutQueue(state);
  const amounts: Record<string, number> = {};
  const partyGroups = new Map<string, { party: string[]; totalCents: number }>();
  for (const contribution of contributingLotsForSale(state, lootName, quantity)) {
    const party = [
      ...payoutQueue.filter((id) => contribution.run.memberIds.includes(id) && selected.has(id)),
      ...contribution.run.memberIds.filter((id) => selected.has(id) && !payoutQueue.includes(id)),
    ];
    if (!party.length) continue;
    const partyKey = [...party].sort().join("|");
    const group = partyGroups.get(partyKey) ?? { party, totalCents: 0 };
    group.totalCents += Math.round(contribution.quantity * unitPrice * 100);
    partyGroups.set(partyKey, group);
  }
  for (const group of partyGroups.values()) {
    const baseCents = Math.floor(group.totalCents / group.party.length);
    const remainder = group.totalCents - baseCents * group.party.length;
    group.party.forEach((id, index) => { amounts[id] = (amounts[id] ?? 0) + (baseCents + (index < remainder ? 1 : 0)) / 100; });
  }
  return amounts;
}

function lootQuantityBreakdownForSale(state: LootState, lootName: string, quantity: number, recipientIds: string[]) {
  const selected = new Set(recipientIds);
  const quantities: Record<string, number> = {};
  for (const contribution of contributingLotsForSale(state, lootName, quantity)) {
    contribution.run.memberIds
      .filter((id) => selected.has(id))
      .forEach((id) => { quantities[id] = (quantities[id] ?? 0) + contribution.quantity; });
  }
  return quantities;
}

function recordedPayouts(sale: Sale) {
  return sale.recipientIds.map((id) => ({ id, amount: sale.recipientAmounts?.[id] ?? sale.salaryEach }));
}

function estimatedPendingSalaryForMember(state: LootState, memberId: string, lootQuery?: string) {
  const soldByLoot = soldQuantitiesByRunLoot(state);
  const payoutOrder = currentPayoutQueue(state);
  const activeIds = new Set(state.members.filter((member) => member.active).map((member) => member.id));
  let totalCents = 0;
  state.runs.filter((run) => run.memberIds.includes(memberId)).forEach((run) => run.loots.forEach((loot) => {
    if (lootQuery && !loot.name.toLowerCase().includes(lootQuery)) return;
    const quantity = loot.quantity - (soldByLoot.get(`${run.id}:${loot.id}`) ?? 0);
    const vendingAmount = vendingPriceFor(state, loot.name);
    if (quantity <= 0 || vendingAmount <= 0) return;
    const party = [
      ...payoutOrder.filter((id) => run.memberIds.includes(id) && activeIds.has(id)),
      ...run.memberIds.filter((id) => activeIds.has(id) && !payoutOrder.includes(id)),
    ];
    const position = party.indexOf(memberId);
    if (position < 0 || party.length === 0) return;
    const lotCents = Math.round(quantity * vendingAmount * 100);
    const baseCents = Math.floor(lotCents / party.length);
    totalCents += baseCents + (position < lotCents - baseCents * party.length ? 1 : 0);
  }));
  return totalCents / 100;
}

function memberNameKey(name: string) {
  return name.normalize("NFKC").trim().toLowerCase().replace(/[il1|]/g, "i").replace(/[^\p{L}\p{N}]/gu, "");
}

function recognizedNames(text: string) {
  const blocked = /^(party|member|leader|level|guild|hp|mp|flyff|universe|invite|leave)$/i;
  return text.split(/\r?\n/)
    .map((line) => line.normalize("NFKC").trim().replace(/[^\p{L}\p{N}_\- ]/gu, "").replace(/\s+/g, ""))
    .filter((line) => line.length >= 3 && line.length <= 22 && !blocked.test(line) && !/^\d+$/.test(line));
}

function nameDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal, previous[rightIndex - 1], above) + 1;
      diagonal = above;
    }
  }
  return previous[right.length];
}

function namesAreSimilar(left: string, right: string) {
  const first = memberNameKey(left);
  const second = memberNameKey(right);
  if (!first || !second) return false;
  const allowedChanges = Math.max(1, Math.floor(Math.max(first.length, second.length) * .24));
  return nameDistance(first, second) <= allowedChanges;
}

function mergeNameReadings(original: string[], enhanced: string[]) {
  const merged: string[] = [];
  for (const name of [...original, ...enhanced]) {
    if (!merged.some((candidate) => namesAreSimilar(candidate, name))) merged.push(name);
  }
  return merged.slice(0, 8);
}

async function preparePartyImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const source = document.createElement("canvas");
    source.width = bitmap.width;
    source.height = bitmap.height;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) return file;
    sourceContext.drawImage(bitmap, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, source.width, source.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const peak = Math.max(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
      const value = peak > 24 ? 0 : 255;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
    sourceContext.putImageData(pixels, 0, 0);
    bitmap.close();

    const output = document.createElement("canvas");
    output.width = source.width * 3;
    output.height = source.height * 3;
    const outputContext = output.getContext("2d");
    if (!outputContext) return file;
    outputContext.imageSmoothingEnabled = false;
    outputContext.drawImage(source, 0, 0, output.width, output.height);
    return await new Promise<Blob>((resolve, reject) => output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image preparation failed")), "image/png"));
  } catch {
    return file;
  }
}

function Logo() {
  return <div className="brand"><span className="brand-mark"><img src="/stoics-logo.webp" alt="Stoics guild emblem" /></span><div><strong>STOICS</strong><small>LOOT LEDGER</small></div></div>;
}

export default function ManagerApp({ initialTab = "dashboard", loginOnly = false }: { initialTab?: Tab; loginOnly?: boolean }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState("");
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [state, setState] = useState<LootState>(cloneSeed);
  const [connected, setConnected] = useState(true);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [mobileNav, setMobileNav] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const [editingRun, setEditingRun] = useState<DungeonRun | null>(null);
  const [showSale, setShowSale] = useState(false);
  const [saleLootName, setSaleLootName] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const [saving, setSaving] = useState(false);

  const inventory = useMemo(() => inventoryFor(state), [state]);
  const totalStock = inventory.reduce((sum, item) => sum + item.available, 0);
  const totalSales = state.sales.reduce((sum, sale) => sum + sale.total, 0);
  const salaryPaid = state.sales.reduce((sum, sale) => sum + recordedPayouts(sale).reduce((saleSum, payout) => saleSum + payout.amount, 0), 0);

  const load = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) { setAuthenticated(false); if (!loginOnly) window.location.replace("/login"); return; }
    const data = await response.json() as { state: LootState; connected: boolean; reason?: string };
    const local = localStorage.getItem("stoics-loot-state");
    const localState = local ? JSON.parse(local) as LootState : null;
    const cloudPrices = normalizeVendingPrices(data.state.vendingPrices);
    const localPrices = normalizeVendingPrices(localState?.vendingPrices);
    const cloudImages = normalizeLootImages(data.state.lootImages);
    const localImages = normalizeLootImages(localState?.lootImages);
    const localIsNewer = localState && Date.parse(localState.lastUpdatedAt ?? "") >= Date.parse(data.state.lastUpdatedAt ?? "");
    const loadedState = data.connected ? { ...data.state, vendingPrices: localIsNewer ? normalizeVendingPrices({ ...cloudPrices, ...localPrices }) : cloudPrices, lootImages: localIsNewer ? normalizeLootImages({ ...cloudImages, ...localImages }) : cloudImages } : localState ?? data.state;
    setState(withResolvedSaleAllocations(loadedState));
    setConnected(Boolean(data.connected));
    setAuthenticated(true);
  }, [loginOnly]);

  useEffect(() => {
    fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json() as Promise<{ authenticated: boolean; username: string | null }>).then((data) => {
      if (data.authenticated) {
        if (loginOnly) window.location.replace("/overview");
        else { setCurrentUser(data.username ?? "Manager"); load(); }
      } else {
        setAuthenticated(false);
        if (!loginOnly) window.location.replace("/login");
      }
    }).catch(() => { setAuthenticated(false); if (!loginOnly) window.location.replace("/login"); });
  }, [load, loginOnly]);

  useEffect(() => {
    if (loginOnly) return;
    const syncTab = () => setTab(pathTabs[window.location.pathname] ?? initialTab);
    window.addEventListener("popstate", syncTab);
    return () => window.removeEventListener("popstate", syncTab);
  }, [initialTab, loginOnly]);

  const navigateToTab = (nextTab: Tab) => {
    const path = tabPaths[nextTab];
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    setTab(nextTab);
    setMobileNav(false);
  };

  const persist = async (next: LootState, action = "Updated loot data") => {
    const now = new Date().toISOString();
    const reconciled = withResolvedSaleAllocations(next);
    const stamped: LootState = {
      ...reconciled,
      auditLog: [{ id: makeId(), username: currentUser, action, createdAt: now }, ...(reconciled.auditLog ?? [])].slice(0, 100),
      lastUpdatedBy: currentUser,
      lastUpdatedAt: now,
    };
    setState(stamped);
    localStorage.setItem("stoics-loot-state", JSON.stringify(stamped));
    setSaving(true);
    try {
      const response = await fetch("/api/state", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(stamped) });
      if (response.ok) {
        const result = await response.json().catch(() => null) as { notificationWarning?: string } | null;
        setConnected(true);
        setFlash(result?.notificationWarning
          ? { type: "warn", text: result.notificationWarning }
          : { type: "good", text: "Saved to Supabase" });
      }
      else {
        const problem = await response.json().catch(() => null) as { error?: string } | null;
        setConnected(false); setFlash({ type: "warn", text: problem?.error ?? "Saved on this device while Supabase is unavailable." });
      }
    } catch {
      setConnected(false);
      setFlash({ type: "warn", text: "Saved on this device while cloud sync is unavailable." });
    } finally {
      setSaving(false);
      window.setTimeout(() => setFlash(null), 3400);
    }
  };

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setLoginBusy(true); setLoginError("");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credentials) });
    const data = await response.json() as { error?: string; username?: string };
    if (!response.ok) { setLoginError(data.error ?? "Unable to sign in."); setLoginBusy(false); return; }
    setCurrentUser(data.username ?? credentials.username.trim());
    window.location.replace("/overview");
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    setCurrentUser("");
    setAuthenticated(false);
    window.location.replace("/login");
  };

  const openSale = (lootName = "") => {
    setSaleLootName(lootName);
    setShowSale(true);
  };

  if (authenticated === null) return <main className="splash"><LoaderCircle className="spin" /><span>Opening the ledger…</span></main>;
  if (!authenticated) return loginOnly
    ? <Login credentials={credentials} setCredentials={setCredentials} submit={login} busy={loginBusy} error={loginError} />
    : <main className="splash"><LoaderCircle className="spin" /><span>Opening login…</span></main>;

  const nav: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "dashboard", label: "Overview", icon: <LayoutDashboard size={18} /> },
    { id: "runs", label: "Dungeon runs", icon: <ShieldCheck size={18} /> },
    { id: "inventory", label: "Loot inventory", icon: <Archive size={18} /> },
    { id: "settlements", label: "Sales & salaries", icon: <Coins size={18} /> },
    { id: "statistics", label: "Statistics", icon: <BarChart3 size={18} /> },
    { id: "search", label: "Member search", icon: <Search size={18} /> },
  ];

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-top"><Logo /><button className="icon-button close-nav" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
        <nav>{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => navigateToTab(item.id)}>{item.icon}<span>{item.label}</span></button>)}<button onClick={() => window.location.assign("/members")}><Sparkles size={18} /><span>Guild Members</span></button></nav>
        <div className="sidebar-note"><Sparkles size={16} /><div><strong>Fair payout queue</strong><span>Oldest waiting member is shown first.</span></div></div>
        <button className="signout" onClick={logout}><LogOut size={17} /> Sign out</button>
      </aside>
      {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <section className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Guild operations</span><ChevronRight size={14} /><strong>{nav.find((item) => item.id === tab)?.label}</strong></div>
          <div className="user-badge"><span>{currentUser.slice(0, 2).toUpperCase()}</span><div><small>Signed in as</small><strong>{currentUser}</strong></div></div>
          <div className={`sync ${connected ? "online" : "local"}`}><span />{saving ? "Saving…" : connected ? "Supabase synced" : "Device save"}</div>
          <button className="primary top-action" onClick={() => setShowRun(true)}><Plus size={17} /> New run</button>
        </header>

        <div className="content">
          {flash && <div className={`flash ${flash.type}`}><Check size={16} />{flash.text}</div>}
          {tab === "dashboard" && <Dashboard state={state} inventory={inventory} totalStock={totalStock} totalSales={totalSales} salaryPaid={salaryPaid} onRun={() => setShowRun(true)} onSale={() => openSale()} />}
          {tab === "runs" && <Runs state={state} onChange={persist} onRun={() => { setEditingRun(null); setShowRun(true); }} onEdit={(run) => { setEditingRun(run); setShowRun(true); }} />}
          {tab === "inventory" && <Inventory inventory={inventory} onSale={openSale} onPriceChange={(name, amount) => persist({ ...state, vendingPrices: setVendingPrice(state.vendingPrices, name, amount) }, `Updated ${name} vending amount`)} onImageChange={(name, image) => persist({ ...state, lootImages: setLootImage(state.lootImages, name, image) }, `Updated ${name} loot photo`)} />}
          {tab === "settlements" && <Settlements state={state} onSale={() => openSale()} />}
          {tab === "statistics" && <Statistics state={state} />}
          {tab === "search" && <MemberSearch state={state} />}
        </div>
      </section>

      {showRun && <RunModal state={state} run={editingRun ?? undefined} currentUser={currentUser} onClose={() => { setShowRun(false); setEditingRun(null); }} onSave={(next) => { void persist(next, editingRun ? `Edited ${editingRun.dungeon}` : "Added a dungeon run"); setShowRun(false); setEditingRun(null); navigateToTab("runs"); }} />}
      {showSale && <SaleModal state={state} inventory={inventory} initialLootName={saleLootName} currentUser={currentUser} onClose={() => { setShowSale(false); setSaleLootName(""); }} onSave={(next) => { void persist(next, "Recorded a batch sale and salaries"); setShowSale(false); setSaleLootName(""); navigateToTab("settlements"); }} />}
    </main>
  );
}

function Login({ credentials, setCredentials, submit, busy, error }: { credentials: { username: string; password: string }; setCredentials: React.Dispatch<React.SetStateAction<{ username: string; password: string }>>; submit: (event: React.FormEvent) => void; busy: boolean; error: string }) {
  return <main className="login-page">
    <section className="login-visual"><FeaturedMembers /><div className="login-visual-content"><Logo /><div className="login-copy"><span className="eyebrow">DUNGEON OPERATIONS</span><h1>Every drop tracked.<br />Every member paid.</h1><p>Turn party screenshots into a clean loot ledger, then settle every sale with a fair, transparent payout queue.</p></div></div></section>
    <section className="login-panel"><form onSubmit={submit} className="login-card"><span className="login-icon"><ShieldCheck size={24} /></span><h2>Manager access</h2><p>Sign in with your manager username and password. Every update is attributed to your account.</p><label>Username<input autoFocus autoComplete="username" value={credentials.username} onChange={(e) => setCredentials((c) => ({ ...c, username: e.target.value }))} placeholder="Enter your username" /></label><label>Password<input type="password" autoComplete="current-password" value={credentials.password} onChange={(e) => setCredentials((c) => ({ ...c, password: e.target.value }))} placeholder="Enter your password" /></label>{error && <div className="form-error">{error}</div>}<button className="primary login-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{busy ? "Checking…" : "Enter loot ledger"}</button><button type="button" className="public-inquiries-link" onClick={() => window.location.assign("/")}><Sparkles size={15} /> Back to Stoics guild home</button><button type="button" className="public-inquiries-link" onClick={() => window.location.assign("/members")}><Users size={15} /> Meet Guild Members</button><button type="button" className="public-inquiries-link" onClick={() => window.location.assign("/inquiries")}><Search size={15} /> Open public inquiries</button><button type="button" className="public-inquiries-link" onClick={() => window.location.assign("/shop")}><Store size={15} /> Open public loot shop</button><small>Credentials are verified securely · Session stored in an HTTP-only cookie</small></form></section>
  </main>;
}

function PageTitle({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>;
}

function Dashboard({ state, inventory, totalStock, totalSales, salaryPaid, onRun, onSale }: { state: LootState; inventory: ReturnType<typeof inventoryFor>; totalStock: number; totalSales: number; salaryPaid: number; onRun: () => void; onSale: () => void }) {
  const payoutQueue = currentPayoutQueue(state);
  const pendingLoot = pendingLootByMember(state);
  return <>
    <PageTitle eyebrow="CONTROL ROOM" title="Loot overview" text="A live view of your runs, stock, and guild payouts." action={<div className="title-actions"><button className="secondary" onClick={onSale}><Coins size={17} /> Record sale</button><button className="primary" onClick={onRun}><Plus size={17} /> New run</button></div>} />
    <div className="metric-grid"><Metric icon={<PackageOpen />} tone="violet" label="Loot in inventory" value={totalStock.toLocaleString()} note={`${inventory.filter((i) => i.available > 0).length} item types`} /><Metric icon={<ReceiptText />} tone="amber" label="Gross sales" value={<PenyaAmount value={totalSales} />} note={`${state.sales.length} recorded batches`} /><Metric icon={<Coins />} tone="mint" label="Salary distributed" value={<PenyaAmount value={salaryPaid} />} note="Even shares, rounded down" /><Metric icon={<Users />} tone="blue" label="Active members" value={state.members.filter((m) => m.active).length.toString()} note="In payout rotation" /></div>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-head"><div><span className="panel-kicker">INVENTORY</span><h2>Ready to sell</h2></div><button className="text-button" onClick={onSale}>Sell a batch <ChevronRight size={15} /></button></div><div className="inventory-preview">{inventory.slice(0, 5).map((item, index) => <div className="inventory-line" key={item.name}><span className={`item-rune rune-${index % 4}`}><Gem size={18} /></span><div><strong>{item.name}</strong><small>{item.collected.toLocaleString()} collected</small></div><b>{item.available.toLocaleString()}</b><span>available</span></div>)}</div></section>
      <section className="panel"><div className="panel-head"><div><span className="panel-kicker">PAYOUT ORDER</span><h2>Who receives next</h2></div><span className="queue-badge">FIFO</span></div><div className="queue-list">{payoutQueue.length === 0 ? <p className="queue-empty">No members have unpaid loot.</p> : <>{payoutQueue.slice(0, 10).map((id, index) => { const member = state.members.find((m) => m.id === id); return member ? <div className="queue-row" key={id}><span className={index === 0 ? "queue-number first" : "queue-number"}>{index + 1}</span><span className="avatar">{member.name.slice(0, 2).toUpperCase()}</span><strong>{member.name}</strong><em>{pendingLoot.get(id) ?? (index === 0 ? "Receives first" : "Pending payment")}</em></div> : null; })}{payoutQueue.length > 10 && <p className="queue-more">More...</p>}</>}</div></section>
    </div>
    <section className="panel recent"><div className="panel-head"><div><span className="panel-kicker">RECENT ACTIVITY</span><h2>Latest dungeon runs</h2></div></div><div className="table-wrap"><table><thead><tr><th>Dungeon</th><th>Date</th><th>Party</th><th>Loot types</th><th>Total units</th></tr></thead><tbody>{state.runs.slice(0, 5).map((run) => <tr key={run.id}><td><strong>{run.dungeon}</strong></td><td>{dateTime.format(new Date(run.createdAt))}</td><td>{run.memberIds.length} members</td><td>{run.loots.length}</td><td><b>{run.loots.reduce((sum, loot) => sum + loot.quantity, 0)}</b></td></tr>)}</tbody></table></div></section>
    <section className="panel audit-panel"><div className="panel-head"><div><span className="panel-kicker">AUDIT TRAIL</span><h2>Who changed the ledger</h2></div>{state.lastUpdatedBy && <span className="last-editor">Last updated by <strong>{state.lastUpdatedBy}</strong></span>}</div><div className="audit-list">{(state.auditLog ?? []).length === 0 ? <p>No updates recorded yet.</p> : state.auditLog.slice(0, 6).map((entry) => <div className="audit-row" key={entry.id}><span className="avatar">{entry.username.slice(0, 2).toUpperCase()}</span><div><strong>{entry.username}</strong><span>{entry.action}</span></div><time>{dateTime.format(new Date(entry.createdAt))}</time></div>)}</div></section>
  </>;
}

type StatisticsPeriod = "weekly" | "monthly" | "yearly";

function Statistics({ state }: { state: LootState }) {
  const [lootPeriod, setLootPeriod] = useState<StatisticsPeriod>("monthly");
  const [now] = useState(() => new Date());
  const today = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const pieColors = ["#6556d8", "#16836d", "#d79836", "#3f7fbc", "#e65555", "#8c65b8", "#42a88d", "#ce7a42", "#7893ce", "#b85c8a"];

  const richestMembers = useMemo(() => state.members.map((member) => {
    const paidSales = state.sales.filter((sale) => sale.recipientIds.includes(member.id));
    const totalPaid = paidSales.reduce((sum, sale) => sum + (sale.recipientAmounts?.[member.id] ?? sale.salaryEach), 0);
    return { id: member.id, name: member.name, totalPaid, payments: paidSales.length };
  }).filter((member) => member.totalPaid > 0).sort((left, right) => right.totalPaid - left.totalPaid).slice(0, 5), [state.members, state.sales]);

  const activeRunners = useMemo(() => state.members.map((member) => {
    const runs = state.runs.filter((run) => run.memberIds.includes(member.id));
    const latest = runs.reduce<Date | null>((current, run) => {
      const runDate = new Date(run.createdAt);
      return !current || runDate > current ? runDate : current;
    }, null);
    return { id: member.id, name: member.name, runs: runs.length, latest };
  }).filter((member) => member.runs > 0).sort((left, right) => right.runs - left.runs || (right.latest?.getTime() ?? 0) - (left.latest?.getTime() ?? 0)).slice(0, 10), [state.members, state.runs]);

  const frequentLoot = useMemo(() => {
    const items = new Map<string, { name: string; appearances: number; quantity: number }>();
    state.runs.forEach((run) => run.loots.forEach((loot) => {
      const key = loot.name.trim().toLowerCase();
      const item = items.get(key) ?? { name: loot.name.trim(), appearances: 0, quantity: 0 };
      item.appearances += 1;
      item.quantity += loot.quantity;
      items.set(key, item);
    }));
    return [...items.values()].sort((left, right) => right.appearances - left.appearances || right.quantity - left.quantity).slice(0, 5);
  }, [state.runs]);

  const weeklyRuns = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() - 6 + index);
    return { label: date.toLocaleDateString("en", { weekday: "short" }), detail: date.toLocaleDateString("en", { month: "short", day: "numeric" }), runs: state.runs.filter((run) => localDateKey(new Date(run.createdAt)) === localDateKey(date)).length };
  }), [state.runs, today]);

  const monthlyRuns = useMemo(() => {
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), index + 1);
      return { label: String(index + 1), detail: date.toLocaleDateString("en", { month: "short", day: "numeric" }), runs: state.runs.filter((run) => localDateKey(new Date(run.createdAt)) === localDateKey(date)).length };
    });
  }, [state.runs, now]);

  const yearlyRuns = useMemo(() => Array.from({ length: 12 }, (_, month) => ({
    label: new Date(now.getFullYear(), month, 1).toLocaleDateString("en", { month: "short" }),
    runs: state.runs.filter((run) => { const date = new Date(run.createdAt); return date.getFullYear() === now.getFullYear() && date.getMonth() === month; }).length,
  })), [state.runs, now]);

  const lootPie = useMemo(() => {
    const start = lootPeriod === "weekly"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      : lootPeriod === "monthly"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(now.getFullYear(), 0, 1);
    const items = new Map<string, { name: string; value: number }>();
    state.runs.filter((run) => { const date = new Date(run.createdAt); return date >= start && date <= now; }).forEach((run) => run.loots.forEach((loot) => {
      const key = loot.name.trim().toLowerCase();
      const item = items.get(key) ?? { name: loot.name.trim(), value: 0 };
      item.value += loot.quantity;
      items.set(key, item);
    }));
    return [...items.values()].sort((left, right) => right.value - left.value);
  }, [lootPeriod, state.runs, now]);

  const chart = (data: Array<{ label: string; runs: number }>) => <ResponsiveContainer width="100%" height={250}><BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}><CartesianGrid stroke="#ece9e2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#858a94", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#858a94", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: "#f0edff" }} contentStyle={{ border: "1px solid #e1ddd5", borderRadius: 9, fontSize: 11 }} /><Bar dataKey="runs" name="Dungeon runs" fill="#6556d8" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer>;

  return <><PageTitle eyebrow="GUILD INSIGHTS" title="Statistics" text="See the strongest earners, most active runners, frequent loot, and dungeon activity over time." /><div className="stats-tables"><StatisticsTable title="Top 5 richest members" subtitle="Ranked by recorded paid salary" headers={["#", "Member", "Payments", "Total paid"]} rows={richestMembers.map((member, index) => [index + 1, member.name, member.payments, <PenyaAmount key={member.id} value={member.totalPaid} />])} empty="No paid salaries recorded yet." /><StatisticsTable title="Top 10 active runners" subtitle="Ranked by dungeon participation" headers={["#", "Member", "Runs", "Latest run"]} rows={activeRunners.map((member, index) => [index + 1, member.name, member.runs, member.latest ? member.latest.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"])} empty="No dungeon participation recorded yet." /><StatisticsTable title="Top 5 frequent loot" subtitle="Ranked by appearances across dungeon runs" headers={["#", "Loot item", "Run drops", "Total units"]} rows={frequentLoot.map((loot, index) => [index + 1, loot.name, loot.appearances, loot.quantity.toLocaleString()])} empty="No loot has been recorded yet." /></div><div className="stats-charts"><section className="stats-panel weekly"><div className="stats-panel-head"><div><span>LAST 7 DAYS</span><h2>Weekly dungeon runs</h2></div></div>{chart(weeklyRuns)}</section><section className="stats-panel monthly"><div className="stats-panel-head"><div><span>{now.toLocaleDateString("en", { month: "long", year: "numeric" }).toUpperCase()}</span><h2>Monthly dungeon runs</h2></div></div>{chart(monthlyRuns)}</section><section className="stats-panel yearly"><div className="stats-panel-head"><div><span>{now.getFullYear()}</span><h2>Yearly dungeon runs</h2></div></div>{chart(yearlyRuns)}</section><section className="stats-panel loot-pie-panel"><div className="stats-panel-head"><div><span>LOOT DISTRIBUTION</span><h2>Loot units collected</h2></div><div className="period-switch" aria-label="Loot chart period">{(["weekly", "monthly", "yearly"] as StatisticsPeriod[]).map((period) => <button type="button" className={lootPeriod === period ? "active" : ""} key={period} onClick={() => setLootPeriod(period)}>{period}</button>)}</div></div>{lootPie.length === 0 ? <div className="stats-empty">No loot recorded in this period.</div> : <div className="pie-layout"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={lootPie} dataKey="value" nameKey="name" innerRadius={58} outerRadius={98} paddingAngle={2}>{lootPie.map((item, index) => <Cell key={item.name} fill={pieColors[index % pieColors.length]} />)}</Pie><Tooltip formatter={(value) => [Number(value).toLocaleString(), "Loot units"]} contentStyle={{ border: "1px solid #e1ddd5", borderRadius: 9, fontSize: 11 }} /></PieChart></ResponsiveContainer><div className="pie-legend">{lootPie.map((item, index) => <div key={item.name}><i style={{ background: pieColors[index % pieColors.length] }} /><span>{item.name}</span><strong>{item.value.toLocaleString()}</strong></div>)}</div></div>}</section></div></>;
}

function StatisticsTable({ title, subtitle, headers, rows, empty }: { title: string; subtitle: string; headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return <section className="stats-panel stats-table"><div className="stats-panel-head"><div><span>LEADERBOARD</span><h2>{title}</h2><p>{subtitle}</p></div></div><div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td className="stats-table-empty" colSpan={headers.length}>{empty}</td></tr> : rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellIndex === 1 ? <strong>{cell}</strong> : cell}</td>)}</tr>)}</tbody></table></div></section>;
}

function Metric({ icon, tone, label, value, note }: { icon: React.ReactNode; tone: string; label: string; value: React.ReactNode; note: string }) { return <article className="metric"><span className={`metric-icon ${tone}`}>{icon}</span><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }

function Runs({ state, onChange, onRun, onEdit }: { state: LootState; onChange: (next: LootState, action?: string) => void; onRun: () => void; onEdit: (run: DungeonRun) => void }) {
  const [pendingDelete, setPendingDelete] = useState<DungeonRun | null>(null);
  const [query, setQuery] = useState("");
  const [runDate, setRunDate] = useState("");
  const soldByLoot = useMemo(() => soldQuantitiesByRunLoot(state), [state]);
  const runHasSales = (run: DungeonRun) => run.loots.some((loot) => (soldByLoot.get(`${run.id}:${loot.id}`) ?? 0) > 0);
  const shownRuns = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return state.runs.filter((run) => {
      const createdAt = new Date(run.createdAt);
      const localDate = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;
      if (runDate && localDate !== runDate) return false;
      if (!needle) return true;
      const memberNames = run.memberIds.map((id) => state.members.find((member) => member.id === id)?.name ?? "");
      return [run.dungeon, ...run.loots.map((loot) => loot.name), ...memberNames]
        .some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }, [query, runDate, state.members, state.runs]);
  const filtersActive = Boolean(query.trim() || runDate);
  const removeRun = () => {
    if (!pendingDelete || runHasSales(pendingDelete)) return;
    onChange({ ...state, runs: state.runs.filter((run) => run.id !== pendingDelete.id) }, `Deleted ${pendingDelete.dungeon}`);
    setPendingDelete(null);
  };
  return <><PageTitle eyebrow="RUN HISTORY" title="Dungeon runs" text="Review each party and see which loot has already been sold." action={<button className="primary" onClick={onRun}><Plus size={17} /> Add dungeon run</button>} /><div className="run-filter-bar"><div className="run-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search run, loot, or member…" aria-label="Search dungeon runs" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear run search"><X size={15} /></button>}</div><label className="run-date-filter"><span>Date</span><input type="date" value={runDate} onChange={(event) => setRunDate(event.target.value)} aria-label="Filter dungeon runs by date" /></label>{filtersActive && <button type="button" className="clear-run-filters" onClick={() => { setQuery(""); setRunDate(""); }}><X size={14} /> Clear filters</button>}<span className="run-result-count">{shownRuns.length} of {state.runs.length} runs</span></div>{shownRuns.length === 0 ? <div className="empty run-filter-empty"><span><Search size={26} /></span><h2>No dungeon runs found</h2><p>Try another run, loot, member, or date.</p>{filtersActive && <button type="button" className="secondary" onClick={() => { setQuery(""); setRunDate(""); }}>Clear filters</button>}</div> : <div className="run-stack">{shownRuns.map((run) => {
    const locked = runHasSales(run);
    return <article className={`run-card ${locked ? "locked" : ""}`} key={run.id}><div className="run-date"><strong>{new Date(run.createdAt).getDate()}</strong><span>{new Date(run.createdAt).toLocaleString("en", { month: "short" })}</span></div><div className="run-main"><div className="run-title"><div><div className="run-heading"><h2>{run.dungeon}</h2>{locked && <span className="run-locked"><Lock size={11} /> Sale recorded · Run locked</span>}</div><span>{dateTime.format(new Date(run.createdAt))} · Added by {run.createdBy ?? "Unknown"}</span></div><div className="run-actions"><button className="icon-button" disabled={locked} title={locked ? "This run cannot be edited because some loot has been sold" : "Edit run"} aria-label={`Edit ${run.dungeon}`} onClick={() => onEdit(run)}><Pencil size={15} /></button><button className="icon-button danger" disabled={locked} title={locked ? "This run cannot be deleted because some loot has been sold" : "Delete run"} aria-label={`Delete ${run.dungeon}`} onClick={() => setPendingDelete(run)}><Trash2 size={16} /></button></div></div><div className="run-section"><label>Party</label><div className="chips">{run.memberIds.map((id) => <span className="member-chip" key={id}>{state.members.find((m) => m.id === id)?.name ?? "Unknown"}</span>)}</div></div><div className="run-section"><label>Loot</label><div className="loot-grid">{run.loots.map((loot) => <EditableLoot key={loot.id} loot={loot} soldQuantity={soldByLoot.get(`${run.id}:${loot.id}`) ?? 0} locked={locked} onChange={(updated) => onChange({ ...state, runs: state.runs.map((candidate) => candidate.id === run.id ? { ...candidate, loots: candidate.loots.map((entry) => entry.id === loot.id ? updated : entry) } : candidate) }, `Edited ${loot.name || "a loot item"}`)} />)}</div></div></div></article>;
  })}</div>}{pendingDelete && <ConfirmModal title="Delete dungeon run?" text={`Delete ${pendingDelete.dungeon} and its party and loot record? This can change inventory totals and future salary eligibility.`} onCancel={() => setPendingDelete(null)} onConfirm={removeRun} />}</>;
}

function EditableLoot({ loot, soldQuantity, locked, onChange }: { loot: RunLoot; soldQuantity: number; locked: boolean; onChange: (loot: RunLoot) => void }) {
  const status = soldQuantity >= loot.quantity ? "All sold" : soldQuantity > 0 ? `${soldQuantity} of ${loot.quantity} sold` : "Unsold";
  return <div className={`editable-loot ${soldQuantity > 0 ? "has-sales" : ""}`}><Gem size={16} /><input aria-label={`${loot.name} name`} disabled={locked} value={loot.name} onChange={(e) => onChange({ ...loot, name: e.target.value })} /><input aria-label={`${loot.name} quantity`} className="qty" type="number" min="0" disabled={locked} value={loot.quantity} onChange={(e) => onChange({ ...loot, quantity: Number(e.target.value) })} /><span className={`loot-sale-status ${soldQuantity >= loot.quantity ? "complete" : soldQuantity > 0 ? "partial" : "unsold"}`}>{status}</span></div>;
}

function Inventory({ inventory, onSale, onPriceChange, onImageChange }: { inventory: ReturnType<typeof inventoryFor>; onSale: (lootName?: string) => void; onPriceChange: (name: string, amount: number) => void; onImageChange: (name: string, image: string) => void }) {
  const [query, setQuery] = useState("");
  const shown = inventory.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  return <><PageTitle eyebrow="STOCK ROOM" title="Loot inventory" text="Accumulated loot, recorded sales, vending amounts, and item photos." action={<button className="primary" onClick={() => onSale()}><Coins size={17} /> Sell loot</button>} /><div className="inventory-toolbar"><div className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search loot…" /></div><span>{shown.length} item types</span></div><div className="inventory-cards">{shown.map((item, index) => <article className="stock-card" key={item.name}><LootPhotoEditor name={item.name} image={item.image} rune={index % 4} onChange={(image) => onImageChange(item.name, image)} /><div className="stock-name"><span>LOOT ITEM</span><h2>{item.name}</h2></div><div className="stock-stats"><div><span>Collected</span><strong>{item.collected.toLocaleString()}</strong></div><div><span>Sold</span><strong>{item.sold.toLocaleString()}</strong></div><div className="available"><span>Available</span><strong>{item.available.toLocaleString()}</strong></div><div className="vending-price"><span>Vending amount</span><VendingPriceInput value={item.vendingAmount} onCommit={(amount) => onPriceChange(item.name, amount)} /></div></div><button className="secondary" disabled={item.available <= 0} onClick={() => onSale(item.name)}>Record sale</button></article>)}</div></>;
}

function LootPhotoEditor({ name, image, rune, onChange }: { name: string; image: string; rune: number; onChange: (image: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError("");
    try { onChange(await resizeLootPhoto(file)); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Could not use that image."); }
    finally { setBusy(false); }
  };
  return <div className="loot-photo-editor" tabIndex={0} onPaste={(event) => { const file = [...event.clipboardData.files].find((candidate) => candidate.type.startsWith("image/")); if (file) { event.preventDefault(); void handleFile(file); } }} aria-label={`Photo for ${name}. Paste an image here or browse.`}><button type="button" className={`stock-icon rune-${rune} ${image ? "has-image" : ""}`} onClick={() => inputRef.current?.click()} aria-label={`Browse for ${name} photo`}>{busy ? <LoaderCircle className="spin" /> : image ? <img src={image} alt={`${name} loot item`} /> : <Gem />}</button><button type="button" className="loot-photo-browse" onClick={() => inputRef.current?.click()}><ImagePlus size={13} /> {image ? "Replace" : "Add photo"}</button><small>{error || "Paste here or browse"}</small><input ref={inputRef} hidden type="file" accept="image/*" onChange={(event) => { void handleFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div>;
}

function VendingPriceInput({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  const commit = () => { const amount = Math.max(0, Number(draft) || 0); setDraft(amount ? String(amount) : ""); if (amount !== value) onCommit(amount); };
  return <label><b><PenyaCoin /></b><input aria-label="Vending amount in Penya" type="number" min="0" step="1" value={draft} placeholder="0" onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

function Settlements({ state, onSale }: { state: LootState; onSale: () => void }) {
  return <><PageTitle eyebrow="TREASURY" title="Sales & salaries" text="Every batch sale and the members who received their share." action={<button className="primary" onClick={onSale}><Coins size={17} /> Record batch sale</button>} /><div className="sale-stack">{state.sales.length === 0 ? <div className="empty"><span><ReceiptText size={28} /></span><h2>No sales recorded yet</h2><p>Sell any accumulated loot to calculate the party salary.</p><button className="primary" onClick={onSale}>Record first sale</button></div> : state.sales.map((sale) => { const payouts = recordedPayouts(sale); const image = lootImageFor(state.lootImages, sale.lootName); return <article className="sale-card" key={sale.id}><span className={`sale-icon ${image ? "has-image" : ""}`}>{image ? <img src={image} alt={`${sale.lootName} loot item`} /> : <Coins />}</span><div className="sale-info"><span>{dateTime.format(new Date(sale.createdAt))} · {sale.createdBy ?? "Unknown"}</span><h2>{sale.lootName}</h2><p>{sale.quantity.toLocaleString()} × <PenyaAmount value={sale.unitPrice} /> each</p></div><div className="sale-total"><span>Total sale</span><strong><PenyaAmount value={sale.total} /></strong></div><div className="salary"><span>{sale.recipientIds.length} recipients</span><strong>Party-based shares</strong><div className="mini-avatars">{sale.recipientIds.slice(0, 6).map((id) => <i key={id}>{state.members.find((m) => m.id === id)?.name.slice(0, 1)}</i>)}</div></div><div className="sale-payout-list">{payouts.map((payout) => <span key={payout.id}><b>{state.members.find((member) => member.id === payout.id)?.name ?? "Unknown"}</b><em><PenyaAmount value={payout.amount} /></em></span>)}</div></article>; })}</div></>;
}

function MemberSearch({ state }: { state: LootState }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const soldByLoot = useMemo(() => soldQuantitiesByRunLoot(state), [state]);
  const payoutOrder = useMemo(() => currentPayoutQueue(state), [state]);
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return state.members.map((member) => {
      const memberMatches = member.name.toLowerCase().includes(normalizedQuery);
      const pendingLoot = new Map<string, { name: string; quantity: number }>();
      state.runs.filter((run) => run.memberIds.includes(member.id)).forEach((run) => run.loots.forEach((loot) => {
        const quantity = loot.quantity - (soldByLoot.get(`${run.id}:${loot.id}`) ?? 0);
        if (quantity <= 0 || (!memberMatches && !loot.name.toLowerCase().includes(normalizedQuery))) return;
        const key = loot.name.trim().toLowerCase();
        const current = pendingLoot.get(key) ?? { name: loot.name.trim(), quantity: 0 };
        current.quantity += quantity;
        pendingLoot.set(key, current);
      }));
      const matchingSales = state.sales.filter((sale) => sale.recipientIds.includes(member.id)
        && (memberMatches || sale.lootName.toLowerCase().includes(normalizedQuery)));
      const paidLoot = new Map<string, { name: string; sales: number }>();
      matchingSales.forEach((sale) => {
        const key = sale.lootName.trim().toLowerCase();
        const current = paidLoot.get(key) ?? { name: sale.lootName.trim(), sales: 0 };
        current.sales += 1;
        paidLoot.set(key, current);
      });
      const totalPaid = matchingSales.reduce((total, sale) => total + (sale.recipientAmounts?.[member.id] ?? sale.salaryEach), 0);
      const estimatedPendingSalary = estimatedPendingSalaryForMember(state, member.id, memberMatches ? undefined : normalizedQuery);
      return { member, memberMatches, pendingLoot: [...pendingLoot.values()], paidLoot: [...paidLoot.values()], totalPaid, estimatedPendingSalary };
    }).filter((result) => result.memberMatches || result.pendingLoot.length > 0 || result.paidLoot.length > 0)
      .sort((left, right) => {
        const leftOrder = payoutOrder.indexOf(left.member.id);
        const rightOrder = payoutOrder.indexOf(right.member.id);
        if (leftOrder >= 0 || rightOrder >= 0) return (leftOrder < 0 ? Number.MAX_SAFE_INTEGER : leftOrder) - (rightOrder < 0 ? Number.MAX_SAFE_INTEGER : rightOrder);
        return left.member.name.localeCompare(right.member.name);
      });
  }, [normalizedQuery, payoutOrder, soldByLoot, state]);

  return <>
    <PageTitle eyebrow="MEMBER LEDGER" title="Search members & loot" text="Find pending loot, paid loot, and the total amount paid to each member." />
    <div className="member-search-bar"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a member or loot item..." />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={16} /></button>}</div>
    {!normalizedQuery ? <div className="search-welcome"><Search size={28} /><h2>Search the guild ledger</h2><p>Enter a member name or an item such as Sunstone.</p></div> : results.length === 0 ? <div className="search-welcome"><Search size={28} /><h2>No matching records</h2><p>Try another member or loot item name.</p></div> : <><div className="search-result-count">{results.length} {results.length === 1 ? "member" : "members"} found</div><div className="member-results">{results.map(({ member, pendingLoot, paidLoot, totalPaid, estimatedPendingSalary }) => <article className="member-result" key={member.id}><div className="member-result-person"><span className="avatar">{member.name.slice(0, 2).toUpperCase()}</span><div><strong>{member.name}</strong><small>{pendingLoot.length > 0 ? "Waiting for loot sale" : paidLoot.length > 0 ? "Paid loot recorded" : "No matching loot"}</small></div></div><div className="member-pending-loot"><span>Pending loot</span><div>{pendingLoot.length > 0 ? pendingLoot.map((loot) => <b key={loot.name}>{loot.quantity.toLocaleString()} × {loot.name}</b>) : <em>None awaiting sale</em>}</div></div><div className="member-paid-loot"><span>Paid loot</span><div>{paidLoot.length > 0 ? paidLoot.map((loot) => <b key={loot.name}>{loot.name}{loot.sales > 1 ? ` · ${loot.sales} sales` : ""}</b>) : <em>No paid loot</em>}</div></div><div className="member-payment-summary"><span>Est. pending salary</span><strong><PenyaAmount value={estimatedPendingSalary} /></strong><span>Total paid</span><strong><PenyaAmount value={totalPaid} /></strong></div></article>)}</div></>}
  </>;
}

function RunModal({ state, run, currentUser, onClose, onSave }: { state: LootState; run?: DungeonRun; currentUser: string; onClose: () => void; onSave: (state: LootState) => void }) {
  const [dungeon, setDungeon] = useState(run?.dungeon ?? "Dekane Mine");
  const [createdAt, setCreatedAt] = useState(() => toDateTimeLocalValue(run ? new Date(run.createdAt) : new Date()));
  const [members, setMembers] = useState<Member[]>(run ? run.memberIds.map((id) => state.members.find((member) => member.id === id)).filter((member): member is Member => Boolean(member)) : []);
  const [selected, setSelected] = useState<string[]>(run?.memberIds ?? []);
  const [loots, setLoots] = useState<RunLoot[]>(run ? run.loots.map((loot) => ({ ...loot })) : [{ id: makeId(), name: "", quantity: 1 }]);
  const [reading, setReading] = useState(false);
  const [ocrNote, setOcrNote] = useState("Paste a party screenshot or choose an image.");
  const [imagePreview, setImagePreview] = useState("");
  const previewUrlRef = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dungeonSuggestions = [...new Map(state.runs
    .map((savedRun) => savedRun.dungeon.trim())
    .filter(Boolean)
    .map((name) => [name.toLowerCase(), name])).values()];
  const suggestions = [...new Set(state.runs.flatMap((run) => run.loots.map((loot) => loot.name)))];

  const readImage = async (file: File) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    setImagePreview(previewUrlRef.current);
    setReading(true); setOcrNote("Reading names from screenshot…");
    try {
      const { createWorker } = await import("tesseract.js");
      const preparedImage = await preparePartyImage(file);
      let pass = "original";
      const worker = await createWorker(["eng", "tha"], undefined, { logger: (message) => { if (message.status === "recognizing text") setOcrNote(`Reading ${pass} image… ${Math.round((message.progress ?? 0) * 100)}%`); } });
      let originalText = "";
      let enhancedText = "";
      try {
        originalText = (await worker.recognize(file)).data.text;
        pass = "enhanced";
        enhancedText = (await worker.recognize(preparedImage)).data.text;
      } finally {
        await worker.terminate();
      }
      const names = mergeNameReadings(recognizedNames(originalText), recognizedNames(enhancedText));
      if (!names.length) { setOcrNote("No clear names found. Add them manually below."); return; }
      const nextMembers = [...members];
      const nextSelected: string[] = [];
      names.forEach((name) => {
        const key = memberNameKey(name);
        let member = nextMembers.find((m) => memberNameKey(m.name) === key)
          ?? state.members.find((m) => memberNameKey(m.name) === key);
        if (!member) member = { id: makeId(), name, active: true };
        if (!nextMembers.some((candidate) => candidate.id === member.id)) nextMembers.push(member);
        if (!nextSelected.includes(member.id)) nextSelected.push(member.id);
      });
      setMembers(nextMembers); setSelected(nextSelected); setOcrNote(`${names.length} names found. Review them before saving.`);
    } catch { setOcrNote("Could not read that image. Add party names manually."); } finally { setReading(false); }
  };

  useEffect(() => {
    const paste = (event: ClipboardEvent) => { const image = [...(event.clipboardData?.files ?? [])].find((file) => file.type.startsWith("image/")); if (image) readImage(image); };
    window.addEventListener("paste", paste); return () => window.removeEventListener("paste", paste);
  });

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  const addMember = () => { const member = { id: makeId(), name: "", active: true }; setMembers((current) => [...current, member]); setSelected((current) => [...current, member.id]); };
  const save = () => {
    const cleanLoots = loots.filter((loot) => loot.name.trim() && loot.quantity > 0);
    const selectedDate = new Date(createdAt);
    if (!dungeon.trim() || !selected.length || !cleanLoots.length || Number.isNaN(selectedDate.getTime())) return;
    const resolvedParty = resolveRunParty(members, selected, state.members, makeId);
    if (!resolvedParty.memberIds.length) return;
    const savedDate = run && createdAt === toDateTimeLocalValue(new Date(run.createdAt))
      ? run.createdAt
      : selectedDate.toISOString();
    const savedRun: DungeonRun = run
      ? { ...run, dungeon: dungeon.trim(), createdAt: savedDate, memberIds: resolvedParty.memberIds, loots: cleanLoots }
      : { id: makeId(), dungeon: dungeon.trim(), createdAt: savedDate, memberIds: resolvedParty.memberIds, loots: cleanLoots, createdBy: currentUser };
    const runs = run ? state.runs.map((candidate) => candidate.id === run.id ? savedRun : candidate) : [savedRun, ...state.runs];
    const nextState = { ...state, members: resolvedParty.members, runs };
    onSave({ ...nextState, payoutQueue: currentPayoutQueue(nextState) });
  };

  return <Modal title={run ? "Edit dungeon run" : "Log a dungeon run"} subtitle={run ? "Update the dungeon, run time, party roster, or recorded loot." : "Import the party, confirm the roster, then record every drop."} onClose={onClose}><div className="modal-scroll"><section className="form-section"><div className="section-label"><span>1</span><div><strong>Dungeon & party screenshot</strong><small>OCR will read names only after you add a screenshot.</small></div></div><datalist id="dungeon-suggestions">{dungeonSuggestions.map((name) => <option value={name} key={name.toLowerCase()} />)}</datalist><div className="two-fields run-details-fields"><label className="field">Dungeon name<input list="dungeon-suggestions" value={dungeon} placeholder="Start typing a saved dungeon name" onChange={(e) => setDungeon(e.target.value)} /></label><label className="field">Run date & time<input type="datetime-local" value={createdAt} onChange={(e) => setCreatedAt(e.target.value)} required /></label></div><button className={`dropzone ${reading ? "reading" : ""} ${imagePreview ? "has-preview" : ""}`} onClick={() => fileRef.current?.click()}><input ref={fileRef} hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && readImage(e.target.files[0])} />{imagePreview ? <img className="party-preview" src={imagePreview} alt="Party screenshot preview" /> : reading ? <LoaderCircle className="spin" /> : <ImagePlus />}<span className="dropzone-status">{reading && imagePreview && <LoaderCircle className="spin" size={15} />}<strong>{ocrNote}</strong><small>PNG or JPG · You can also press Ctrl+V</small></span></button></section><section className="form-section"><div className="section-label"><span>2</span><div><strong>Confirm party members</strong><small>{run ? "Add, remove, or correct members in this saved party." : "No members are prefilled. Import a screenshot or add them manually."}</small></div></div><datalist id="member-suggestions">{state.members.map((member) => <option value={member.name} key={member.id} />)}</datalist><div className="member-editor">{members.map((member) => <div key={member.id} className={selected.includes(member.id) ? "member-edit selected" : "member-edit"}><button onClick={() => setSelected((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])}>{selected.includes(member.id) && <Check size={13} />}</button><input list="member-suggestions" value={member.name} placeholder="Start typing a saved member name" onChange={(e) => { const name = e.currentTarget.value; setMembers((current) => current.map((m) => m.id === member.id ? { ...m, name } : m)); }} /><button className="remove" onClick={() => { setMembers((current) => current.filter((m) => m.id !== member.id)); setSelected((current) => current.filter((id) => id !== member.id)); }}><X size={14} /></button></div>)}</div><button className="text-button add-member" onClick={addMember}><Plus size={15} /> Add member manually</button></section><section className="form-section"><div className="section-label"><span>3</span><div><strong>Add loot</strong><small>Suggestions learn from previously saved loot names.</small></div></div><datalist id="loot-suggestions">{suggestions.map((name) => <option value={name} key={name} />)}</datalist><div className="loot-editor"><div className="loot-head"><span>Loot name</span><span>Quantity</span></div>{loots.map((loot) => <div className="loot-edit-row" key={loot.id}><input list="loot-suggestions" value={loot.name} placeholder="e.g. Sunstone" onChange={(e) => setLoots((current) => current.map((item) => item.id === loot.id ? { ...item, name: e.target.value } : item))} /><input type="number" min="1" value={loot.quantity} onChange={(e) => setLoots((current) => current.map((item) => item.id === loot.id ? { ...item, quantity: Number(e.target.value) } : item))} /><button className="icon-button" onClick={() => setLoots((current) => current.filter((item) => item.id !== loot.id))}><Trash2 size={15} /></button></div>)}</div><button className="text-button" onClick={() => setLoots((current) => [...current, { id: makeId(), name: "", quantity: 1 }])}><Plus size={15} /> Add another loot</button></section></div><div className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={save}><Check size={16} /> {run ? "Save changes" : "Save dungeon run"}</button></div></Modal>;
}

function SaleModal({ state, inventory, initialLootName: requestedLootName, currentUser, onClose, onSave }: { state: LootState; inventory: ReturnType<typeof inventoryFor>; initialLootName?: string; currentUser: string; onClose: () => void; onSave: (state: LootState) => void }) {
  const available = inventory.filter((item) => item.available > 0);
  const initialItem = available.find((item) => item.name.toLowerCase() === requestedLootName?.toLowerCase()) ?? available[0];
  const initialLootName = initialItem?.name ?? "";
  const initialQuantity = initialItem?.available ?? 1;
  const [lootName, setLootName] = useState(initialLootName);
  const stock = available.find((item) => item.name === lootName);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [unitPrice, setUnitPrice] = useState(initialItem?.vendingAmount ?? 0);
  const eligibleIds = useMemo(() => eligibleMembersForSale(state, lootName, quantity), [state, lootName, quantity]);
  const [recipients, setRecipients] = useState<string[]>(() => eligibleMembersForSale(state, initialLootName, initialQuantity));
  const [mailRecipientId, setMailRecipientId] = useState(recipients[0] ?? "");
  const [copiedKey, setCopiedKey] = useState("");
  const selectLoot = (name: string) => {
    const nextQuantity = available.find((item) => item.name === name)?.available ?? 1;
    setLootName(name);
    setQuantity(nextQuantity);
    setUnitPrice(available.find((item) => item.name === name)?.vendingAmount ?? 0);
    setRecipients(eligibleMembersForSale(state, name, nextQuantity));
  };
  const selectQuantity = (nextQuantity: number) => {
    setQuantity(nextQuantity);
    setRecipients(eligibleMembersForSale(state, lootName, nextQuantity));
  };
  const total = quantity * unitPrice;
  const recipientAmounts = useMemo(() => salaryBreakdownForSale(state, lootName, quantity, unitPrice, recipients), [state, lootName, quantity, unitPrice, recipients]);
  const recipientLootQuantities = useMemo(() => lootQuantityBreakdownForSale(state, lootName, quantity, recipients), [state, lootName, quantity, recipients]);
  const allocatedTotal = Object.values(recipientAmounts).reduce((sum, amount) => sum + amount, 0);
  const allocationComplete = Math.round(allocatedTotal * 100) === Math.round(total * 100);
  const selectedMailRecipientId = recipients.includes(mailRecipientId) ? mailRecipientId : recipients[0] ?? "";
  const selectedMailMember = state.members.find((member) => member.id === selectedMailRecipientId);
  const selectedMailSalary = recipientAmounts[selectedMailRecipientId] ?? 0;
  const selectedMailLootQuantity = recipientLootQuantities[selectedMailRecipientId] ?? 0;
  const formattedMailLootQuantity = lootQuantityAmount.format(selectedMailLootQuantity);
  const mailLootName = selectedMailLootQuantity === 1 || /s$/i.test(lootName) ? lootName : `${lootName}s`;
  const mailHeader = `SOLD ${formattedMailLootQuantity} ${mailLootName}`;
  const mailContent = `Sold ${formattedMailLootQuantity} ${mailLootName} ${compactMailAmount(unitPrice)} Each | ${plainAmount.format(selectedMailSalary)} Total`;
  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => current === key ? "" : current), 1600);
    } catch {
      setCopiedKey("");
    }
  };
  const save = () => {
    if (!lootName || quantity < 1 || quantity > (stock?.available ?? 0) || unitPrice <= 0 || !recipients.length || !allocationComplete) return;
    const salaryEach = recipients.length ? Math.round((allocatedTotal / recipients.length) * 100) / 100 : 0;
    const allocations = contributingLotsForSale(state, lootName, quantity).map(({ runLootId, quantity: allocatedQuantity }) => ({ runLootId, quantity: allocatedQuantity }));
    const sale: Sale = { id: makeId(), lootName, quantity, unitPrice, total, recipientIds: recipients, salaryEach, recipientAmounts, allocations, createdAt: new Date().toISOString(), createdBy: currentUser };
    const unpaid = currentPayoutQueue(state).filter((id) => !recipients.includes(id));
    const nextState = { ...state, sales: [sale, ...state.sales], payoutQueue: [...unpaid, ...recipients] };
    onSave({ ...nextState, payoutQueue: currentPayoutQueue(nextState) });
  };
  return <Modal title="Record a batch sale" subtitle="Each sold loot lot is divided among the party that earned it." onClose={onClose}><div className="modal-scroll sale-modal"><section className="form-section"><div className="section-label"><span>1</span><div><strong>Sale details</strong><small>Choose any accumulated loot in stock.</small></div></div><div className="two-fields"><label className="field">Loot<select value={lootName} onChange={(e) => selectLoot(e.target.value)}>{available.map((item) => <option key={item.name}>{item.name}</option>)}</select><small>{stock?.available.toLocaleString() ?? 0} available</small></label><label className="field">Quantity sold<input type="number" min="1" max={stock?.available} value={quantity} onChange={(e) => selectQuantity(Number(e.target.value))} /></label></div><label className="field">Price per item (Penya)<input type="number" min="0" value={unitPrice || ""} placeholder="0" onChange={(e) => setUnitPrice(Number(e.target.value))} /></label></section><section className="sale-summary"><div><span>Gross sale</span><strong><PenyaAmount value={total} /></strong></div><div><span>Recipients</span><strong>{recipients.length}</strong></div><div className="highlight"><span>Allocated salaries</span><strong><PenyaAmount value={allocatedTotal} /></strong></div></section><section className="form-section"><div className="section-label"><span>2</span><div><strong>Party salary allocation</strong><small>Each run’s sold quantity is split only among that run’s selected party members.</small></div></div><div className="recipient-list">{eligibleIds.map((id, index) => { const member = state.members.find((m) => m.id === id)!; const amount = recipientAmounts[id] ?? 0; return <div key={id} className={recipients.includes(id) ? "recipient selected" : "recipient"}><input aria-label={`Include ${member.name}`} type="checkbox" checked={recipients.includes(id)} onChange={() => setRecipients((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])} /><span className={index === 0 ? "queue-number first" : "queue-number"}>{index + 1}</span><span className="avatar">{member.name.slice(0, 2).toUpperCase()}</span><strong>{member.name}</strong>{index === 0 && <em>First to receive</em>}<span className="recipient-tools"><b>{recipients.includes(id) ? <PenyaAmount value={amount} /> : "Skipped"}</b><button type="button" title={`Copy ${member.name}`} aria-label={`Copy ${member.name}`} onClick={() => copyText(`name-${id}`, member.name)}>{copiedKey === `name-${id}` ? <Check size={13} /> : <Copy size={13} />}<span>Name</span></button><button type="button" disabled={!recipients.includes(id)} title={`Copy ${plainAmount.format(amount)}`} aria-label={`Copy salary for ${member.name}`} onClick={() => copyText(`amount-${id}`, String(amount))}>{copiedKey === `amount-${id}` ? <Check size={13} /> : <Copy size={13} />}<span>Salary</span></button></span></div>; })}</div>{!allocationComplete && total > 0 && <div className="allocation-warning">Select at least one member from every contributing party before saving.</div>}</section><section className="form-section mailing-helper"><div className="section-label"><span>3</span><div><strong>Mailing helper</strong><small>Choose a member to generate mail using their exact sold loot quantity and salary.</small></div></div><label className="mail-recipient">Mail recipient<select value={selectedMailRecipientId} onChange={(event) => setMailRecipientId(event.target.value)}>{recipients.map((id) => <option value={id} key={id}>{state.members.find((member) => member.id === id)?.name ?? "Unknown"}</option>)}</select></label><div className="mail-copy-row"><span>Mail header</span><code>{mailHeader}</code><button type="button" onClick={() => copyText("mail-header", mailHeader)}>{copiedKey === "mail-header" ? <Check size={14} /> : <Copy size={14} />} Copy</button></div><div className="mail-copy-row"><span>Mail content</span><code>{mailContent}</code><button type="button" onClick={() => copyText("mail-content", mailContent)}>{copiedKey === "mail-content" ? <Check size={14} /> : <Copy size={14} />} Copy</button></div><div className="mail-copy-row"><span>Member name</span><code>{selectedMailMember?.name ?? ""}</code><button type="button" disabled={!selectedMailMember} onClick={() => copyText("mail-member", selectedMailMember?.name ?? "")}>{copiedKey === "mail-member" ? <Check size={14} /> : <Copy size={14} />} Copy</button></div><div className="mail-copy-row"><span>Salary amount</span><code>{plainAmount.format(selectedMailSalary)}</code><button type="button" disabled={!selectedMailRecipientId} onClick={() => copyText("mail-salary", String(selectedMailSalary))}>{copiedKey === "mail-salary" ? <Check size={14} /> : <Copy size={14} />} Copy</button></div></section></div><div className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!allocationComplete || unitPrice <= 0 || quantity < 1 || quantity > (stock?.available ?? 0)} onClick={save}><Coins size={16} /> Save sale & salaries</button></div></Modal>;
}

function ConfirmModal({ title, text, onCancel, onConfirm }: { title: string; text: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop confirm-backdrop" role="presentation"><div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text"><span className="confirm-icon"><Trash2 size={22} /></span><h2 id="confirm-title">{title}</h2><p id="confirm-text">{text}</p><div className="confirm-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="danger-button" onClick={onConfirm}><Trash2 size={15} /> Delete run</button></div></div></div>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">STOICS LOOT LEDGER</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>{children}</div></div>; }
