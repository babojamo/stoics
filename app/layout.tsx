import type { Metadata } from "next";
import "./globals.css";

const managedHostname = "stoics-loots.kevinloquencio.chatgpt.site";
const publicOrigin = "https://stoics-loots.lokwensio.com";

export const metadata: Metadata = {
  title: "Stoics Loots — Flyff Universe Loot Ledger",
  description: "Track dungeon parties, loot inventory, batch sales, and fair member salaries.",
  metadataBase: new URL(publicOrigin),
  alternates: { canonical: "/" },
  icons: {
    icon: "/stoics-icon.png",
    shortcut: "/stoics-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){if(window.location.hostname===${JSON.stringify(managedHostname)}){window.location.replace(${JSON.stringify(publicOrigin)}+window.location.pathname+window.location.search+window.location.hash);}})();` }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
