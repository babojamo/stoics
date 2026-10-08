import type { Metadata } from "next";
import ManagerApp from "../../components/manager-app";

export const metadata: Metadata = { title: "Sales & Salaries | Stoics Loot Ledger" };
export default function SalesPage() { return <ManagerApp initialTab="settlements" />; }
