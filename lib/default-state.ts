import type { LootState } from "./types";

export const defaultState: LootState = {
  members: [
    { id: "m-aeris", name: "Aeris", active: true },
    { id: "m-kaizen", name: "Kaizen", active: true },
    { id: "m-nyx", name: "Nyx", active: true },
    { id: "m-riven", name: "Riven", active: true },
    { id: "m-seraph", name: "Seraph", active: true },
    { id: "m-volt", name: "Volt", active: true },
    { id: "m-lumi", name: "Lumi", active: true },
    { id: "m-orion", name: "Orion", active: true },
  ],
  runs: [
    {
      id: "run-seed-1",
      dungeon: "Dekane Mine",
      createdAt: "2026-10-05T13:20:00.000Z",
      memberIds: ["m-aeris", "m-kaizen", "m-nyx", "m-riven", "m-seraph", "m-volt", "m-lumi", "m-orion"],
      loots: [
        { id: "loot-seed-1", name: "Sunstone", quantity: 126 },
        { id: "loot-seed-2", name: "Moonstone", quantity: 38 },
        { id: "loot-seed-3", name: "Lightning Card (4%)", quantity: 2 },
      ],
      createdBy: "System",
    },
  ],
  sales: [],
  vendingPrices: {},
  payoutQueue: ["m-aeris", "m-kaizen", "m-nyx", "m-riven", "m-seraph", "m-volt", "m-lumi", "m-orion"],
  auditLog: [],
};

