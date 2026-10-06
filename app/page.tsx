"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronRight,
  Coins,
  Gem,
  ImagePlus,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  PackageOpen,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { defaultState } from "../lib/default-state";
import type { DungeonRun, LootState, Member, RunLoot, Sale } from "../lib/types";

type Tab = "dashboard" | "runs" | "inventory" | "settlements";
type Flash = { type: "good" | "warn"; text: string } | null;

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const makeId = () => crypto.randomUUID();
const cloneSeed = () => JSON.parse(JSON.stringify(defaultState)) as LootState;

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
  return [...map.values()].map((row) => ({ ...row, available: row.collected - row.sold })).sort((a, b) => b.available - a.available);
}

function eligibleMembersForSale(state: LootState, lootName: string, quantity: number) {
  const key = lootName.trim().toLowerCase();
  let previouslySold = state.sales
    .filter((sale) => sale.lootName.trim().toLowerCase() === key)
    .reduce((sum, sale) => sum + sale.quantity, 0);
  let requested = Math.max(0, quantity);
  const contributingMembers = new Set<string>();
  const lots = [...state.runs]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .flatMap((run) => run.loots
      .filter((loot) => loot.name.trim().toLowerCase() === key)
      .map((loot) => ({ run, quantity: loot.quantity })));

  for (const lot of lots) {
    const consumed = Math.min(previouslySold, lot.quantity);
    previouslySold -= consumed;
    const available = lot.quantity - consumed;
    if (available <= 0 || requested <= 0) continue;
    lot.run.memberIds.forEach((id) => contributingMembers.add(id));
    requested -= Math.min(requested, available);
  }

  const activeEligible = state.members
    .filter((member) => member.active && contributingMembers.has(member.id))
    .map((member) => member.id);
  return [
    ...state.payoutQueue.filter((id) => activeEligible.includes(id)),
    ...activeEligible.filter((id) => !state.payoutQueue.includes(id)),
  ];
}

function memberNameKey(name: string) {
  return name.trim().toLowerCase().replace(/[il1|]/g, "i").replace(/[^a-z0-9]/g, "");
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

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState("");
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [state, setState] = useState<LootState>(cloneSeed);
  const [connected, setConnected] = useState(true);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const [showSale, setShowSale] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [saving, setSaving] = useState(false);

  const inventory = useMemo(() => inventoryFor(state), [state]);
  const totalStock = inventory.reduce((sum, item) => sum + item.available, 0);
  const totalSales = state.sales.reduce((sum, sale) => sum + sale.total, 0);
  const salaryPaid = state.sales.reduce((sum, sale) => sum + sale.salaryEach * sale.recipientIds.length, 0);

  const load = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) { setAuthenticated(false); return; }
    const data = await response.json() as { state: LootState; connected: boolean; reason?: string };
    const local = localStorage.getItem("stoics-loot-state");
    setState(data.connected ? data.state : local ? JSON.parse(local) : data.state);
    setConnected(Boolean(data.connected));
    setAuthenticated(true);
  }, []);

  useEffect(() => {
    fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json() as Promise<{ authenticated: boolean; username: string | null }>).then((data) => {
      if (data.authenticated) { setCurrentUser(data.username ?? "Manager"); load(); }
      else { setAuthenticated(false); }
    }).catch(() => setAuthenticated(false));
  }, [load]);

  const persist = async (next: LootState, action = "Updated loot data") => {
    const now = new Date().toISOString();
    const stamped: LootState = {
      ...next,
      auditLog: [{ id: makeId(), username: currentUser, action, createdAt: now }, ...(next.auditLog ?? [])].slice(0, 100),
      lastUpdatedBy: currentUser,
      lastUpdatedAt: now,
    };
    setState(stamped);
    localStorage.setItem("stoics-loot-state", JSON.stringify(stamped));
    setSaving(true);
    try {
      const response = await fetch("/api/state", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(stamped) });
      if (response.ok) { setConnected(true); setFlash({ type: "good", text: "Saved to Supabase" }); }
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
    await load(); setLoginBusy(false);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    setCurrentUser("");
    setAuthenticated(false);
  };

  if (authenticated === null) return <main className="splash"><LoaderCircle className="spin" /><span>Opening the ledger…</span></main>;
  if (!authenticated) return <Login credentials={credentials} setCredentials={setCredentials} submit={login} busy={loginBusy} error={loginError} />;

  const nav: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "dashboard", label: "Overview", icon: <LayoutDashboard size={18} /> },
    { id: "runs", label: "Dungeon runs", icon: <ShieldCheck size={18} /> },
    { id: "inventory", label: "Loot inventory", icon: <Archive size={18} /> },
    { id: "settlements", label: "Sales & salaries", icon: <Coins size={18} /> },
  ];

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-top"><Logo /><button className="icon-button close-nav" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
        <nav>{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setMobileNav(false); }}>{item.icon}<span>{item.label}</span></button>)}</nav>
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
          {tab === "dashboard" && <Dashboard state={state} inventory={inventory} totalStock={totalStock} totalSales={totalSales} salaryPaid={salaryPaid} onRun={() => setShowRun(true)} onSale={() => setShowSale(true)} />}
          {tab === "runs" && <Runs state={state} onChange={persist} onRun={() => setShowRun(true)} />}
          {tab === "inventory" && <Inventory inventory={inventory} onSale={() => setShowSale(true)} />}
          {tab === "settlements" && <Settlements state={state} onSale={() => setShowSale(true)} />}
        </div>
      </section>

      {showRun && <RunModal state={state} currentUser={currentUser} onClose={() => setShowRun(false)} onSave={(next) => { persist(next, "Added a dungeon run"); setShowRun(false); setTab("runs"); }} />}
      {showSale && <SaleModal state={state} inventory={inventory} currentUser={currentUser} onClose={() => setShowSale(false)} onSave={(next) => { persist(next, "Recorded a batch sale and salaries"); setShowSale(false); setTab("settlements"); }} />}
    </main>
  );
}

function Login({ credentials, setCredentials, submit, busy, error }: { credentials: { username: string; password: string }; setCredentials: React.Dispatch<React.SetStateAction<{ username: string; password: string }>>; submit: (event: React.FormEvent) => void; busy: boolean; error: string }) {
  return <main className="login-page">
    <section className="login-visual"><div className="visual-glow" /><Logo /><div className="login-copy"><span className="eyebrow">DUNGEON OPERATIONS</span><h1>Every drop tracked.<br />Every member paid.</h1><p>Turn party screenshots into a clean loot ledger, then settle every sale with a fair, transparent payout queue.</p></div><div className="loot-orbit one"><Gem size={28} /></div><div className="loot-orbit two"><Coins size={24} /></div></section>
    <section className="login-panel"><form onSubmit={submit} className="login-card"><span className="login-icon"><ShieldCheck size={24} /></span><h2>Manager access</h2><p>Use your own username for update attribution, then enter the shared manager password.</p><label>Username<input autoFocus value={credentials.username} onChange={(e) => setCredentials((c) => ({ ...c, username: e.target.value }))} placeholder="Enter your username" /></label><label>Manager password<input type="password" value={credentials.password} onChange={(e) => setCredentials((c) => ({ ...c, password: e.target.value }))} placeholder="Enter manager password" /></label>{error && <div className="form-error">{error}</div>}<button className="primary login-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{busy ? "Checking…" : "Enter loot ledger"}</button><small>Session secured with an HTTP-only cookie · Password controlled by the environment</small></form></section>
  </main>;
}

function PageTitle({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>;
}

function Dashboard({ state, inventory, totalStock, totalSales, salaryPaid, onRun, onSale }: { state: LootState; inventory: ReturnType<typeof inventoryFor>; totalStock: number; totalSales: number; salaryPaid: number; onRun: () => void; onSale: () => void }) {
  return <>
    <PageTitle eyebrow="CONTROL ROOM" title="Loot overview" text="A live view of your runs, stock, and guild payouts." action={<div className="title-actions"><button className="secondary" onClick={onSale}><Coins size={17} /> Record sale</button><button className="primary" onClick={onRun}><Plus size={17} /> New run</button></div>} />
    <div className="metric-grid"><Metric icon={<PackageOpen />} tone="violet" label="Loot in inventory" value={totalStock.toLocaleString()} note={`${inventory.filter((i) => i.available > 0).length} item types`} /><Metric icon={<ReceiptText />} tone="amber" label="Gross sales" value={peso.format(totalSales)} note={`${state.sales.length} recorded batches`} /><Metric icon={<Coins />} tone="mint" label="Salary distributed" value={peso.format(salaryPaid)} note="Even shares, rounded down" /><Metric icon={<Users />} tone="blue" label="Active members" value={state.members.filter((m) => m.active).length.toString()} note="In payout rotation" /></div>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-head"><div><span className="panel-kicker">INVENTORY</span><h2>Ready to sell</h2></div><button className="text-button" onClick={onSale}>Sell a batch <ChevronRight size={15} /></button></div><div className="inventory-preview">{inventory.slice(0, 5).map((item, index) => <div className="inventory-line" key={item.name}><span className={`item-rune rune-${index % 4}`}><Gem size={18} /></span><div><strong>{item.name}</strong><small>{item.collected.toLocaleString()} collected</small></div><b>{item.available.toLocaleString()}</b><span>available</span></div>)}</div></section>
      <section className="panel"><div className="panel-head"><div><span className="panel-kicker">PAYOUT ORDER</span><h2>Who receives next</h2></div><span className="queue-badge">FIFO</span></div><div className="queue-list">{state.payoutQueue.slice(0, 6).map((id, index) => { const member = state.members.find((m) => m.id === id); return member ? <div className="queue-row" key={id}><span className={index === 0 ? "queue-number first" : "queue-number"}>{index + 1}</span><span className="avatar">{member.name.slice(0, 2).toUpperCase()}</span><strong>{member.name}</strong>{index === 0 && <em>Receives first</em>}</div> : null; })}</div></section>
    </div>
    <section className="panel recent"><div className="panel-head"><div><span className="panel-kicker">RECENT ACTIVITY</span><h2>Latest dungeon runs</h2></div></div><div className="table-wrap"><table><thead><tr><th>Dungeon</th><th>Date</th><th>Party</th><th>Loot types</th><th>Total units</th></tr></thead><tbody>{state.runs.slice(0, 5).map((run) => <tr key={run.id}><td><strong>{run.dungeon}</strong></td><td>{dateTime.format(new Date(run.createdAt))}</td><td>{run.memberIds.length} members</td><td>{run.loots.length}</td><td><b>{run.loots.reduce((sum, loot) => sum + loot.quantity, 0)}</b></td></tr>)}</tbody></table></div></section>
    <section className="panel audit-panel"><div className="panel-head"><div><span className="panel-kicker">AUDIT TRAIL</span><h2>Who changed the ledger</h2></div>{state.lastUpdatedBy && <span className="last-editor">Last updated by <strong>{state.lastUpdatedBy}</strong></span>}</div><div className="audit-list">{(state.auditLog ?? []).length === 0 ? <p>No updates recorded yet.</p> : state.auditLog.slice(0, 6).map((entry) => <div className="audit-row" key={entry.id}><span className="avatar">{entry.username.slice(0, 2).toUpperCase()}</span><div><strong>{entry.username}</strong><span>{entry.action}</span></div><time>{dateTime.format(new Date(entry.createdAt))}</time></div>)}</div></section>
  </>;
}

function Metric({ icon, tone, label, value, note }: { icon: React.ReactNode; tone: string; label: string; value: string; note: string }) { return <article className="metric"><span className={`metric-icon ${tone}`}>{icon}</span><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }

function Runs({ state, onChange, onRun }: { state: LootState; onChange: (next: LootState, action?: string) => void; onRun: () => void }) {
  const removeRun = (id: string) => onChange({ ...state, runs: state.runs.filter((run) => run.id !== id) }, "Deleted a dungeon run");
  return <><PageTitle eyebrow="RUN HISTORY" title="Dungeon runs" text="Review party rosters and edit the loot captured after every clear." action={<button className="primary" onClick={onRun}><Plus size={17} /> Add dungeon run</button>} /><div className="run-stack">{state.runs.map((run) => <article className="run-card" key={run.id}><div className="run-date"><strong>{new Date(run.createdAt).getDate()}</strong><span>{new Date(run.createdAt).toLocaleString("en", { month: "short" })}</span></div><div className="run-main"><div className="run-title"><div><h2>{run.dungeon}</h2><span>{dateTime.format(new Date(run.createdAt))} · Added by {run.createdBy ?? "Unknown"}</span></div><button className="icon-button danger" aria-label="Delete run" onClick={() => removeRun(run.id)}><Trash2 size={16} /></button></div><div className="run-section"><label>Party</label><div className="chips">{run.memberIds.map((id) => <span className="member-chip" key={id}>{state.members.find((m) => m.id === id)?.name ?? "Unknown"}</span>)}</div></div><div className="run-section"><label>Loot</label><div className="loot-grid">{run.loots.map((loot) => <EditableLoot key={loot.id} loot={loot} onChange={(updated) => onChange({ ...state, runs: state.runs.map((candidate) => candidate.id === run.id ? { ...candidate, loots: candidate.loots.map((entry) => entry.id === loot.id ? updated : entry) } : candidate) }, `Edited ${loot.name || "a loot item"}`)} />)}</div></div></div></article>)}</div></>;
}

function EditableLoot({ loot, onChange }: { loot: RunLoot; onChange: (loot: RunLoot) => void }) { return <div className="editable-loot"><Gem size={16} /><input value={loot.name} onChange={(e) => onChange({ ...loot, name: e.target.value })} /><input className="qty" type="number" min="0" value={loot.quantity} onChange={(e) => onChange({ ...loot, quantity: Number(e.target.value) })} /></div>; }

function Inventory({ inventory, onSale }: { inventory: ReturnType<typeof inventoryFor>; onSale: () => void }) {
  const [query, setQuery] = useState("");
  const shown = inventory.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  return <><PageTitle eyebrow="STOCK ROOM" title="Loot inventory" text="Accumulated loot from every run, minus recorded batch sales." action={<button className="primary" onClick={onSale}><Coins size={17} /> Sell loot</button>} /><div className="inventory-toolbar"><div className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search loot…" /></div><span>{shown.length} item types</span></div><div className="inventory-cards">{shown.map((item, index) => <article className="stock-card" key={item.name}><div className={`stock-icon rune-${index % 4}`}><Gem /></div><div className="stock-name"><span>LOOT ITEM</span><h2>{item.name}</h2></div><div className="stock-stats"><div><span>Collected</span><strong>{item.collected.toLocaleString()}</strong></div><div><span>Sold</span><strong>{item.sold.toLocaleString()}</strong></div><div className="available"><span>Available</span><strong>{item.available.toLocaleString()}</strong></div></div><button className="secondary" disabled={item.available <= 0} onClick={onSale}>Record sale</button></article>)}</div></>;
}

function Settlements({ state, onSale }: { state: LootState; onSale: () => void }) {
  return <><PageTitle eyebrow="TREASURY" title="Sales & salaries" text="Every batch sale and the members who received their share." action={<button className="primary" onClick={onSale}><Coins size={17} /> Record batch sale</button>} /><div className="sale-stack">{state.sales.length === 0 ? <div className="empty"><span><ReceiptText size={28} /></span><h2>No sales recorded yet</h2><p>Sell any accumulated loot to calculate the party salary.</p><button className="primary" onClick={onSale}>Record first sale</button></div> : state.sales.map((sale) => <article className="sale-card" key={sale.id}><span className="sale-icon"><Coins /></span><div className="sale-info"><span>{dateTime.format(new Date(sale.createdAt))} · {sale.createdBy ?? "Unknown"}</span><h2>{sale.lootName}</h2><p>{sale.quantity.toLocaleString()} × {peso.format(sale.unitPrice)} each</p></div><div className="sale-total"><span>Total sale</span><strong>{peso.format(sale.total)}</strong></div><div className="salary"><span>{sale.recipientIds.length} recipients</span><strong>{peso.format(sale.salaryEach)} each</strong><div className="mini-avatars">{sale.recipientIds.slice(0, 6).map((id) => <i key={id}>{state.members.find((m) => m.id === id)?.name.slice(0, 1)}</i>)}</div></div></article>)}</div></>;
}

function RunModal({ state, currentUser, onClose, onSave }: { state: LootState; currentUser: string; onClose: () => void; onSave: (state: LootState) => void }) {
  const [dungeon, setDungeon] = useState("Dekane Mine");
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loots, setLoots] = useState<RunLoot[]>([{ id: makeId(), name: "", quantity: 1 }]);
  const [reading, setReading] = useState(false);
  const [ocrNote, setOcrNote] = useState("Paste a party screenshot or choose an image.");
  const fileRef = useRef<HTMLInputElement>(null);
  const suggestions = [...new Set(state.runs.flatMap((run) => run.loots.map((loot) => loot.name)))];

  const readImage = async (file: File) => {
    setReading(true); setOcrNote("Reading names from screenshot…");
    try {
      const { recognize } = await import("tesseract.js");
      const preparedImage = await preparePartyImage(file);
      const result = await recognize(preparedImage, "eng", { logger: (message) => { if (message.status === "recognizing text") setOcrNote(`Reading names… ${Math.round((message.progress ?? 0) * 100)}%`); } });
      const blocked = /^(party|member|leader|level|guild|hp|mp|flyff|universe|invite|leave)$/i;
      const names = result.data.text.split(/\r?\n/).map((line) => line.trim().replace(/[^a-zA-Z0-9_\- ]/g, "")).filter((line) => line.length >= 3 && line.length <= 22 && !blocked.test(line) && !/^\d+$/.test(line)).slice(0, 8);
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

  const addMember = () => { const member = { id: makeId(), name: "", active: true }; setMembers((current) => [...current, member]); setSelected((current) => [...current, member.id]); };
  const save = () => {
    const cleanLoots = loots.filter((loot) => loot.name.trim() && loot.quantity > 0);
    if (!dungeon.trim() || !selected.length || !cleanLoots.length) return;
    const resolvedParty = members
      .filter((member) => selected.includes(member.id) && member.name.trim())
      .map((member) => state.members.find((existing) => existing.name.toLowerCase() === member.name.trim().toLowerCase()) ?? { ...member, name: member.name.trim() });
    const uniqueParty = [...new Map(resolvedParty.map((member) => [member.id, member])).values()];
    if (!uniqueParty.length) return;
    const newMembers = uniqueParty.filter((member) => !state.members.some((existing) => existing.id === member.id));
    const mergedMembers = [...state.members, ...newMembers];
    const run: DungeonRun = { id: makeId(), dungeon: dungeon.trim(), createdAt: new Date().toISOString(), memberIds: uniqueParty.map((member) => member.id), loots: cleanLoots, createdBy: currentUser };
    onSave({ ...state, members: mergedMembers, runs: [run, ...state.runs], payoutQueue: [...state.payoutQueue, ...newMembers.map((member) => member.id).filter((id) => !state.payoutQueue.includes(id))] });
  };

  return <Modal title="Log a dungeon run" subtitle="Import the party, confirm the roster, then record every drop." onClose={onClose}><div className="modal-scroll"><section className="form-section"><div className="section-label"><span>1</span><div><strong>Dungeon & party screenshot</strong><small>OCR will read names only after you add a screenshot.</small></div></div><label className="field">Dungeon name<input value={dungeon} onChange={(e) => setDungeon(e.target.value)} /></label><button className={`dropzone ${reading ? "reading" : ""}`} onClick={() => fileRef.current?.click()}><input ref={fileRef} hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && readImage(e.target.files[0])} />{reading ? <LoaderCircle className="spin" /> : <ImagePlus />}<strong>{ocrNote}</strong><span>PNG or JPG · You can also press Ctrl+V</span></button></section><section className="form-section"><div className="section-label"><span>2</span><div><strong>Confirm party members</strong><small>No members are prefilled. Import a screenshot or add them manually.</small></div></div><datalist id="member-suggestions">{state.members.map((member) => <option value={member.name} key={member.id} />)}</datalist><div className="member-editor">{members.map((member) => <div key={member.id} className={selected.includes(member.id) ? "member-edit selected" : "member-edit"}><button onClick={() => setSelected((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])}>{selected.includes(member.id) && <Check size={13} />}</button><input list="member-suggestions" value={member.name} placeholder="Start typing a saved member name" onChange={(e) => setMembers((current) => current.map((m) => m.id === member.id ? { ...m, name: e.target.value } : m))} /><button className="remove" onClick={() => { setMembers((current) => current.filter((m) => m.id !== member.id)); setSelected((current) => current.filter((id) => id !== member.id)); }}><X size={14} /></button></div>)}</div><button className="text-button add-member" onClick={addMember}><Plus size={15} /> Add member manually</button></section><section className="form-section"><div className="section-label"><span>3</span><div><strong>Add loot</strong><small>Suggestions learn from previously saved loot names.</small></div></div><datalist id="loot-suggestions">{suggestions.map((name) => <option value={name} key={name} />)}</datalist><div className="loot-editor"><div className="loot-head"><span>Loot name</span><span>Quantity</span></div>{loots.map((loot) => <div className="loot-edit-row" key={loot.id}><input list="loot-suggestions" value={loot.name} placeholder="e.g. Sunstone" onChange={(e) => setLoots((current) => current.map((item) => item.id === loot.id ? { ...item, name: e.target.value } : item))} /><input type="number" min="1" value={loot.quantity} onChange={(e) => setLoots((current) => current.map((item) => item.id === loot.id ? { ...item, quantity: Number(e.target.value) } : item))} /><button className="icon-button" onClick={() => setLoots((current) => current.filter((item) => item.id !== loot.id))}><Trash2 size={15} /></button></div>)}</div><button className="text-button" onClick={() => setLoots((current) => [...current, { id: makeId(), name: "", quantity: 1 }])}><Plus size={15} /> Add another loot</button></section></div><div className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={save}><Check size={16} /> Save dungeon run</button></div></Modal>;
}

function SaleModal({ state, inventory, currentUser, onClose, onSave }: { state: LootState; inventory: ReturnType<typeof inventoryFor>; currentUser: string; onClose: () => void; onSave: (state: LootState) => void }) {
  const available = inventory.filter((item) => item.available > 0);
  const [lootName, setLootName] = useState(available[0]?.name ?? "");
  const stock = available.find((item) => item.name === lootName);
  const [quantity, setQuantity] = useState(stock?.available ?? 1);
  const [unitPrice, setUnitPrice] = useState(0);
  const eligibleIds = useMemo(() => eligibleMembersForSale(state, lootName, quantity), [state, lootName, quantity]);
  const [recipients, setRecipients] = useState<string[]>([]);
  useEffect(() => { setRecipients(eligibleIds); }, [eligibleIds]);
  useEffect(() => { setQuantity(stock?.available ?? 1); }, [lootName, stock?.available]);
  const total = quantity * unitPrice;
  const salary = recipients.length ? Math.floor(total / recipients.length) : 0;
  const save = () => {
    if (!lootName || quantity < 1 || quantity > (stock?.available ?? 0) || unitPrice <= 0 || !recipients.length) return;
    const sale: Sale = { id: makeId(), lootName, quantity, unitPrice, total, recipientIds: recipients, salaryEach: salary, createdAt: new Date().toISOString(), createdBy: currentUser };
    const unpaid = state.payoutQueue.filter((id) => !recipients.includes(id));
    onSave({ ...state, sales: [sale, ...state.sales], payoutQueue: [...unpaid, ...recipients] });
  };
  return <Modal title="Record a batch sale" subtitle="Sell accumulated stock and split the proceeds fairly." onClose={onClose}><div className="modal-scroll sale-modal"><section className="form-section"><div className="section-label"><span>1</span><div><strong>Sale details</strong><small>Choose any accumulated loot in stock.</small></div></div><div className="two-fields"><label className="field">Loot<select value={lootName} onChange={(e) => setLootName(e.target.value)}>{available.map((item) => <option key={item.name}>{item.name}</option>)}</select><small>{stock?.available.toLocaleString() ?? 0} available</small></label><label className="field">Quantity sold<input type="number" min="1" max={stock?.available} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label></div><label className="field">Price per item (PHP)<input type="number" min="0" value={unitPrice || ""} placeholder="0" onChange={(e) => setUnitPrice(Number(e.target.value))} /></label></section><section className="sale-summary"><div><span>Gross sale</span><strong>{peso.format(total)}</strong></div><div><span>Recipients</span><strong>{recipients.length}</strong></div><div className="highlight"><span>Salary each</span><strong>{peso.format(salary)}</strong></div></section><section className="form-section"><div className="section-label"><span>2</span><div><strong>Select salary recipients</strong><small>Members are ordered by the fair payout queue. First in line appears first.</small></div></div><div className="recipient-list">{eligibleIds.map((id, index) => { const member = state.members.find((m) => m.id === id)!; return <label key={id} className={recipients.includes(id) ? "recipient selected" : "recipient"}><input type="checkbox" checked={recipients.includes(id)} onChange={() => setRecipients((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])} /><span className={index === 0 ? "queue-number first" : "queue-number"}>{index + 1}</span><span className="avatar">{member.name.slice(0, 2).toUpperCase()}</span><strong>{member.name}</strong>{index === 0 && <em>First to receive</em>}<b>{recipients.includes(id) ? peso.format(salary) : "Skipped"}</b></label>; })}</div></section></div><div className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={save}><Coins size={16} /> Save sale & salaries</button></div></Modal>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="eyebrow">STOICS LOOT LEDGER</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>{children}</div></div>; }
