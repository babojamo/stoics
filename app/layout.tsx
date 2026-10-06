import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stoics Loots — Flyff Universe Loot Ledger",
  description: "Track dungeon parties, loot inventory, batch sales, and fair member salaries.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
