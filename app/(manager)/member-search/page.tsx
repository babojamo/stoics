import type { Metadata } from "next";
import ManagerApp from "../../components/manager-app";

export const metadata: Metadata = { title: "Member Search | Stoics Loot Ledger" };
export default function MemberSearchPage() { return <ManagerApp initialTab="search" />; }
