import type { Metadata } from "next";

const publicOrigin = "https://stoics-loots.lokwensio.com";
const shopUrl = `${publicOrigin}/shop`;
const title = "Stoics Loot Shop | Flyff Universe Vending Prices";
const description = "Browse the Stoics Flyff Universe loot shop, search available dungeon loot, and check the latest vending price for every item.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "Stoics Loot Shop",
    "Flyff Universe",
    "Flyff loot prices",
    "dungeon loot shop",
    "vending prices",
    "guild loot inventory",
  ],
  alternates: { canonical: shopUrl },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_PH",
    url: shopUrl,
    siteName: "Stoics Loot Ledger",
    title,
    description,
    images: [{
      url: `${publicOrigin}/stoics-logo.webp`,
      width: 1024,
      height: 1024,
      alt: "Stoics guild emblem",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${publicOrigin}/stoics-logo.webp`],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: title,
  description,
  url: shopUrl,
  isPartOf: {
    "@type": "WebSite",
    name: "Stoics Loot Ledger",
    url: `${publicOrigin}/`,
  },
  mainEntity: {
    "@type": "ProductCollection",
    name: "Stoics Flyff Universe dungeon loot",
    description: "Available dungeon loot and current vending prices from the Stoics Loot Ledger.",
  },
};

export default function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    {children}
  </>;
}
