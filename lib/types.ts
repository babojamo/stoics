export type Member = {
  id: string;
  name: string;
  active: boolean;
};

export type RunLoot = {
  id: string;
  name: string;
  quantity: number;
};

export type DungeonRun = {
  id: string;
  dungeon: string;
  createdAt: string;
  memberIds: string[];
  loots: RunLoot[];
  createdBy?: string;
};

export type Sale = {
  id: string;
  lootName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  recipientIds: string[];
  salaryEach: number;
  recipientAmounts?: Record<string, number>;
  allocations?: Array<{ runLootId: string; quantity: number }>;
  createdAt: string;
  createdBy?: string;
};

export type AuditEntry = {
  id: string;
  username: string;
  action: string;
  createdAt: string;
};

export type LootState = {
  members: Member[];
  runs: DungeonRun[];
  sales: Sale[];
  vendingPrices: Record<string, number>;
  lootImages: Record<string, string>;
  payoutQueue: string[];
  auditLog: AuditEntry[];
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
};

