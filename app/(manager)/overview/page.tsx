import type { Metadata } from "next";
import ManagerApp from "../../components/manager-app";

export const metadata: Metadata = { title: "Overview | Stoics Loot Ledger" };
export default function OverviewPage() { return <ManagerApp initialTab="dashboard" />; }
