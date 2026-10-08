import type { Metadata } from "next";
import { ArrowRight, Coins, Gem, Search, ShieldCheck, Sparkles, Store, Users } from "lucide-react";
import { FeaturedMembers } from "./components/featured-members";

export const metadata: Metadata = {
  title: "Stoics Guild | Flyff Universe Dungeon Community",
  description: "Stoics is a Flyff Universe guild built around teamwork, memorable dungeon runs, and a transparent loot system that gives every member a fair share.",
  keywords: ["Stoics guild", "Flyff Universe guild", "Flyff dungeon community", "guild loot ledger", "Flyff featured members"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_PH",
    url: "/",
    siteName: "Stoics Guild",
    title: "Stoics Guild | Run as one. Share every reward.",
    description: "Stoics is a Flyff Universe guild built around teamwork, memorable dungeon runs, and a transparent loot system that gives every member a fair share.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Gwingarcia, featured member of the Stoics Flyff Universe guild" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stoics Guild | Run as one. Share every reward.",
    description: "Stoics is a Flyff Universe guild built around teamwork, memorable dungeon runs, and a transparent loot system that gives every member a fair share.",
    images: ["/opengraph-image"],
  },
};

export default function LandingPage() {
  return <main className="guild-landing">
    <header className="landing-header">
      <a className="landing-brand" href="/" aria-label="Stoics guild home"><span><img src="/stoics-logo.webp" alt="Stoics guild emblem" /></span><div><strong>STOICS</strong><small>FLYFF UNIVERSE GUILD</small></div></a>
      <nav className="landing-nav" aria-label="Main navigation"><a href="#about">About</a><a href="/members">Members</a><a href="/shop">Loot shop</a><a href="/inquiries">Inquiries</a></nav>
      <a className="landing-login" href="/login"><ShieldCheck size={16} /> Manager login</a>
    </header>

    <section className="landing-hero">
      <div className="landing-hero-copy">
        <span className="landing-kicker"><Sparkles size={14} /> STOICS GUILD</span>
        <h1>Run as one.<br /><em>Share every reward.</em></h1>
        <p>Stoics is a Flyff Universe guild built around teamwork, memorable dungeon runs, and a transparent loot system that gives every member a fair share.</p>
        <div className="landing-hero-actions"><a className="landing-primary" href="/members">Meet our members <ArrowRight size={17} /></a><a className="landing-secondary" href="/shop"><Store size={17} /> Browse the loot shop</a></div>
        <div className="landing-pill-row"><span><ShieldCheck size={15} /> Fair payouts</span><span><Gem size={15} /> Shared loot</span><span><Users size={15} /> One guild</span></div>
      </div>
      <div className="landing-carousel-wrap"><FeaturedMembers variant="public" /></div>
    </section>

    <section className="landing-cinematic" id="cinematic" aria-labelledby="landing-cinematic-title">
      <div className="landing-cinematic-intro"><span className="landing-section-kicker">THE STOICS STORY</span><h2 id="landing-cinematic-title">See the guild in motion.</h2><p>A cinematic look at the members who make every run memorable.</p></div>
      <div className="landing-cinematic-frame"><video controls playsInline preload="none" poster="/stoics-guild-cinematic-poster.webp" aria-label="Stoics guild cinematic video"><source src="/stoics-guild-cinematic.mp4" type="video/mp4" />Your browser does not support HTML video.</video></div>
    </section>

    <section className="landing-about" id="about">
      <div className="landing-emblem"><span><img src="/stoics-logo.webp" alt="Stoics guild logo" /></span><i /><i /><i /></div>
      <div className="landing-about-copy"><span className="landing-section-kicker">ABOUT THE GUILD</span><h2>Strong parties are built on trust.</h2><p>Stoics brings players together for organized dungeon runs, shared progression, and fair distribution of every valuable drop. Our public ledger makes loot, vending prices, sales, and member payouts easy to follow.</p><p>Every run adds to the guild story. Every member helps write it.</p><a href="/inquiries">Explore the public ledger <ArrowRight size={16} /></a></div>
    </section>

    <section className="landing-values">
      <div className="landing-section-heading"><span className="landing-section-kicker">WHAT DEFINES STOICS</span><h2>Adventure with accountability.</h2></div>
      <div className="landing-value-grid">
        <article><span><Users size={23} /></span><h3>Guild before glory</h3><p>We run together, support every role, and celebrate the party behind each victory.</p></article>
        <article><span><Gem size={23} /></span><h3>Every drop tracked</h3><p>Dungeon loot stays visible from the moment it drops until it is sold and settled.</p></article>
        <article><span><Coins size={23} /></span><h3>Every share respected</h3><p>Transparent salaries and payout order keep rewards clear and fair for the whole guild.</p></article>
      </div>
    </section>

    <section className="landing-callout"><div><span>ENTER THE STOICS LEDGER</span><h2>See the guild in action.</h2><p>Meet the roster, check available loot, or look up member payouts.</p></div><div><a href="/members"><Users size={17} /> Guild Members</a><a href="/shop"><Store size={17} /> Loot shop</a><a href="/inquiries"><Search size={17} /> Public inquiries</a></div></section>

    <footer className="landing-footer"><div className="landing-footer-brand"><img src="/stoics-logo.webp" alt="" /><div><strong>STOICS</strong><span>Run as one. Share every reward.</span></div></div><nav aria-label="Footer navigation"><a href="/">Home</a><a href="/members">Guild Members</a><a href="/shop">Loot shop</a><a href="/inquiries">Public inquiries</a><a href="/login">Manager login</a></nav><p>Website created by <strong>Kevin Loquencio</strong></p></footer>
  </main>;
}
