import type { Metadata } from "next";

const inquiriesUrl = "https://stoics-loots.kevinloquencio.chatgpt.site/inquiries";
const title = "Stoics Loot Ledger | Public Loot & Salary Inquiries";
const description = "Search the Stoics Flyff Universe loot ledger to review members' pending dungeon loot, estimated salaries, paid loot, and total payouts.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "Stoics Loot Ledger",
    "Flyff Universe",
    "dungeon loot tracker",
    "guild loot inventory",
    "member salary inquiries",
    "party loot payouts",
  ],
  alternates: { canonical: inquiriesUrl },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_PH",
    url: inquiriesUrl,
    siteName: "Stoics Loot Ledger",
    title,
    description,
    images: [{
      url: "https://stoics-loots.kevinloquencio.chatgpt.site/stoics-logo.webp",
      width: 1024,
      height: 1024,
      alt: "Stoics guild emblem",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["https://stoics-loots.kevinloquencio.chatgpt.site/stoics-logo.webp"],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: title,
  description,
  url: inquiriesUrl,
  isPartOf: {
    "@type": "WebSite",
    name: "Stoics Loot Ledger",
    url: "https://stoics-loots.kevinloquencio.chatgpt.site/",
  },
  about: {
    "@type": "Thing",
    name: "Flyff Universe dungeon loot and guild member payouts",
  },
};

export default function InquiriesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    {children}
  </>;
}
