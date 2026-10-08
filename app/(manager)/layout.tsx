import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ManagerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const request = new Request("https://stoics.lokwensio.com/overview", { headers: await headers() });
  if (!(await getSessionUser(request))) redirect("/login");
  return children;
}
