import type { Metadata } from "next";
import ManagerApp from "../../components/manager-app";

export const metadata: Metadata = { title: "Statistics | Stoics Loot Ledger" };
export default function StatisticsPage() { return <ManagerApp initialTab="statistics" />; }
