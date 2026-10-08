import { Search, ShieldCheck, Sparkles, Store } from "lucide-react";
import { featuredMembers } from "../components/featured-members-data";

const membersPageMembers = [
  ...featuredMembers.filter((member) => member.name === "Gwingarcia"),
  ...featuredMembers.filter((member) => member.name !== "Gwingarcia"),
];

export default function MembersPage() {
  return <main className="public-inquiries featured-members-page">
    <header className="public-inquiries-header">
      <a className="public-brand" href="/" aria-label="Open Stoics guild home"><span><img src="/stoics-logo.webp" alt="Stoics guild emblem" /></span><div><strong>STOICS</strong><small>GUILD MEMBERS</small></div></a>
      <nav className="public-header-actions" aria-label="Public pages">
        <a className="manager-link" href="/shop"><Store size={16} /><span className="public-nav-label">Loot shop</span></a>
        <a className="manager-link" href="/inquiries"><Search size={16} /><span className="public-nav-label">Inquiries</span></a>
        <a className="manager-link" href="/login"><ShieldCheck size={16} /><span className="public-nav-label">Manager login</span></a>
      </nav>
    </header>
    <section className="public-inquiries-content featured-members-content">
      <div className="members-hero"><span className="members-hero-icon"><Sparkles size={26} /></span><div className="public-title"><span>STOICS GUILD</span><h1>Guild Members</h1><p>Meet the members who run, fight, and share every reward with Stoics.</p></div></div>
      <div className="featured-member-grid">
        {membersPageMembers.map((member) => <article className="featured-member-card" key={member.name}>
          <img src={member.image} alt={`${member.name}, ${member.role}`} />
          <div className="featured-member-card-shade" />
          <div className="featured-member-card-copy"><span>Guild member</span><h2>{member.name}</h2><p>{member.role}</p></div>
        </article>)}
      </div>
    </section>
  </main>;
}
