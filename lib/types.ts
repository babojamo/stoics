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
};

export type Sale = {
  id: string;
  lootName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  recipientIds: string[];
  salaryEach: number;
  createdAt: string;
};

export type LootState = {
  members: Member[];
  runs: DungeonRun[];
  sales: Sale[];
  payoutQueue: string[];
};

