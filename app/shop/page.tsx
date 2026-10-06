"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleCheck, Gem, LoaderCircle, Search, ShieldCheck, Store, Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { PenyaAmount } from "../components/penya";

type ShopItem = { name: string; vendingPrice: number; available: number };

export default function ShopPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("query") ?? "");
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/shop", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { items?: ShopItem[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "The public shop is unavailable.");
        setItems(data.items ?? []);
      } catch (problem) {
        if (problem instanceof DOMException && problem.name === "AbortError") return;
        setItems([]);
        setError(problem instanceof Error ? problem.message : "The public shop is unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("query", query.trim());
    else url.searchParams.delete("query");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [query]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  }, [items, query]);

  return <main className="public-inquiries public-shop">
    <header className="public-inquiries-header">
      <button type="button" className="public-brand" onClick={() => window.location.assign("/")} aria-label="Open Stoics Loot Ledger manager login"><span><img src="/stoics-logo.webp" alt="Stoics guild emblem" /></span><div><strong>STOICS</strong><small>LOOT SHOP</small></div></button>
      <div className="public-header-actions"><button type="button" className="manager-link" onClick={() => window.location.assign("/inquiries")}><Users size={16} /> Member inquiries</button><button type="button" className="manager-link" onClick={() => window.location.assign("/")}><ShieldCheck size={16} /> Manager login</button></div>
    </header>
    <section className="public-inquiries-content">
      <div className="shop-hero"><div className="shop-hero-icon"><Store size={26} /></div><div className="public-title"><span>STOICS PUBLIC SHOP</span><h1>Dungeon loot & vending prices</h1><p>Browse available Stoics loot and check the latest vending price for every item.</p></div></div>
      <div className="member-search-bar public-search shop-search"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search loot by name..." />{loading ? <LoaderCircle className="spin" size={18} /> : query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={16} /></button>}</div>
      {error ? <div className="search-welcome error-state"><Store size={28} /><h2>Shop unavailable</h2><p>{error}</p></div> : loading ? <div className="search-welcome"><LoaderCircle className="spin" size={28} /><h2>Loading the shop</h2><p>Checking the latest loot and vending prices.</p></div> : <><div className="shop-results-heading"><strong>{filteredItems.length} {filteredItems.length === 1 ? "loot item" : "loot items"}</strong><span>Prices are set by the Stoics loot managers.</span></div>{filteredItems.length === 0 ? <div className="search-welcome"><Search size={28} /><h2>No loot found</h2><p>Try another loot item name.</p></div> : <div className="shop-grid">{filteredItems.map((item) => <article className={`shop-card ${item.available === 0 ? "sold-out" : ""}`} key={item.name}><div className="shop-card-icon"><Gem size={21} /></div><div className="shop-card-name"><span>Loot item</span><h2>{item.name}</h2>{item.available === 0 ? <small className="shop-sold-out">SOLD OUT</small> : <small className="shop-in-stock"><CircleCheck size={13} />{item.available.toLocaleString()} {item.available === 1 ? "unit" : "units"} available</small>}</div><div className="shop-card-price"><span>Vending price</span>{item.vendingPrice > 0 ? <strong><PenyaAmount value={item.vendingPrice} /></strong> : <strong className="price-pending">Price pending</strong>}<small>per item</small></div></article>)}</div>}</>}
    </section>
  </main>;
}
