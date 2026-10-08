import type { Metadata } from "next";
import ManagerApp from "../../components/manager-app";

export const metadata: Metadata = { title: "Loot Inventory | Stoics Loot Ledger" };
export default function LootInventoryPage() { return <ManagerApp initialTab="inventory" />; }
