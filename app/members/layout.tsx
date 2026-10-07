import type { Metadata } from "next";

const publicOrigin = "https://stoics-loots.lokwensio.com";
const membersUrl = `${publicOrigin}/members`;
const title = "Featured Stoics Members | Flyff Universe Guild";
const description = "Meet the featured members of Stoics, a Flyff Universe guild that tracks dungeon loot, fair party payouts, and vending prices.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["Stoics guild members", "Flyff Universe guild", "featured members", "Flyff dungeon guild"],
  alternates: { canonical: membersUrl },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_PH",
    url: membersUrl,
    siteName: "Stoics Loot Ledger",
    title,
    description,
    images: [{ url: `${publicOrigin}/stoics-logo.webp`, width: 1024, height: 1024, alt: "Stoics guild emblem" }],
  },
  twitter: { card: "summary_large_image", title, description, images: [`${publicOrigin}/stoics-logo.webp`] },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: title,
  description,
  url: membersUrl,
  isPartOf: { "@type": "WebSite", name: "Stoics Loot Ledger", url: `${publicOrigin}/` },
};

export default function MembersLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />{children}</>;
}
