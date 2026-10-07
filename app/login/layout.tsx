import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manager Login | Stoics Loot Ledger",
  description: "Secure manager access to the Stoics dungeon loot ledger.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
