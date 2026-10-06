"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Search, ShieldCheck, X } from "lucide-react";
import { useSearchParams } from "next/navigation";

type InquiryResult = {
  name: string;
  pendingLoot: Array<{ name: string; quantity: number }>;
  paidLoot: Array<{ name: string; sales: number }>;
  totalPaid: number;
  estimatedPendingSalary: number;
};

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function InquiriesPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("query") ?? "");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<InquiryResult[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("query", query.trim());
    else url.searchParams.delete("query");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    if (!query.trim()) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/inquiries?query=${encodeURIComponent(query.trim())}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { results?: InquiryResult[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Search is unavailable.");
        setResults(data.results ?? []);
      } catch (problem) {
        if (problem instanceof DOMException && problem.name === "AbortError") return;
        setResults([]); setError(problem instanceof Error ? problem.message : "Search is unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const updateQuery = (value: string) => {
    setQuery(value);
    if (!value.trim()) { setResults([]); setError(""); setLoading(false); }
  };

  const openManagerLogin = () => window.location.assign("/");

  return <main className="public-inquiries">
    <header className="public-inquiries-header"><button type="button" className="public-brand" onClick={openManagerLogin} aria-label="Open Stoics Loot Ledger manager login"><span><img src="/stoics-logo.webp" alt="Stoics guild emblem" /></span><div><strong>STOICS</strong><small>LOOT LEDGER</small></div></button><button type="button" className="manager-link" onClick={openManagerLogin}><ShieldCheck size={16} /> Manager login</button></header>
    <section className="public-inquiries-content">
      <div className="public-title"><span>PUBLIC INQUIRIES</span><h1>Search members & loot</h1><p>Review pending loot, paid loot, and the total amount paid to each member.</p></div>
      <div className="member-search-bar public-search"><Search size={20} /><input autoFocus value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search a member or loot item..." />{loading ? <LoaderCircle className="spin" size={18} /> : query && <button aria-label="Clear search" onClick={() => updateQuery("")}><X size={16} /></button>}</div>
      {!query.trim() ? <div className="search-welcome"><Search size={28} /><h2>Search the public ledger</h2><p>Enter a member name or an item such as Sunstone.</p></div> : error ? <div className="search-welcome error-state"><Search size={28} /><h2>Search unavailable</h2><p>{error}</p></div> : !loading && results.length === 0 ? <div className="search-welcome"><Search size={28} /><h2>No matching records</h2><p>Try another member or loot item name.</p></div> : <><div className="search-result-count">{loading ? "Searching..." : `${results.length} ${results.length === 1 ? "member" : "members"} found`}</div><div className="member-results">{results.map((result) => <article className="member-result" key={result.name}><div className="member-result-person"><span className="avatar">{result.name.slice(0, 2).toUpperCase()}</span><div><strong>{result.name}</strong><small>{result.pendingLoot.length > 0 ? "Waiting for loot sale" : result.paidLoot.length > 0 ? "Paid loot recorded" : "No matching loot"}</small></div></div><div className="member-pending-loot"><span>Pending loot</span><div>{result.pendingLoot.length > 0 ? result.pendingLoot.map((loot) => <b key={loot.name}>{loot.quantity.toLocaleString()} × {loot.name}</b>) : <em>None awaiting sale</em>}</div></div><div className="member-paid-loot"><span>Paid loot</span><div>{result.paidLoot.length > 0 ? result.paidLoot.map((loot) => <b key={loot.name}>{loot.name}{loot.sales > 1 ? ` · ${loot.sales} sales` : ""}</b>) : <em>No paid loot</em>}</div></div><div className="member-payment-summary"><span>Est. pending salary</span><strong>{peso.format(result.estimatedPendingSalary)}</strong><span>Total paid</span><strong>{peso.format(result.totalPaid)}</strong></div></article>)}</div></>}
    </section>
  </main>;
}
