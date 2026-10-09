import type { Metadata } from "next";

const publicOrigin = "https://stoics.lokwensio.com";
const membersUrl = `${publicOrigin}/members`;
const title = "Guild Members";
const description = "Meet the members who run, fight, and share every reward with Stoics.";
const previewImage = `${membersUrl}/opengraph-image.png`;

export const metadata: Metadata = {
  title,
  description,
  keywords: ["Stoics guild members", "Flyff Universe guild", "guild members", "Flyff dungeon guild"],
  alternates: { canonical: membersUrl },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_PH",
    url: membersUrl,
    siteName: "Stoics Loot Ledger",
    title,
    description,
    images: [{ url: previewImage, width: 1672, height: 941, alt: "Stoics guild members gathered around the guild crest" }],
  },
  twitter: { card: "summary_large_image", title, description, images: [previewImage] },
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
