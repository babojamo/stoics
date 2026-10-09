import assert from "node:assert/strict";
import test from "node:test";
import { resolveRunParty } from "./run-party.ts";

test("editing a member in one run leaves other runs using the original member", () => {
  const sinaloa = { id: "sinaloa", name: "Sinaloa", active: true };
  const members = [sinaloa];
  const firstRun = { memberIds: [sinaloa.id] };
  const secondRun = { memberIds: [sinaloa.id] };

  const resolved = resolveRunParty([{ ...sinaloa, name: "MelZz" }], firstRun.memberIds, members, () => "melzz");
  firstRun.memberIds = resolved.memberIds;

  assert.equal(resolved.members.find((member) => member.id === firstRun.memberIds[0])?.name, "MelZz");
  assert.equal(resolved.members.find((member) => member.id === secondRun.memberIds[0])?.name, "Sinaloa");
  assert.notEqual(firstRun.memberIds[0], secondRun.memberIds[0]);
});

test("choosing an existing member reuses that member without changing the original", () => {
  const members = [
    { id: "sinaloa", name: "Sinaloa", active: true },
    { id: "melzz", name: "MelZz", active: true },
  ];
  const resolved = resolveRunParty([{ ...members[0], name: "MelZz" }], ["sinaloa"], members, () => "unused");

  assert.deepEqual(resolved.memberIds, ["melzz"]);
  assert.deepEqual(resolved.members, members);
});
