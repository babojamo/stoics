import type { Member } from "./types";

export function resolveRunParty(
  editedMembers: Member[],
  selectedIds: string[],
  savedMembers: Member[],
  makeId: () => string,
) {
  const selected = new Set(selectedIds);
  const savedByName = new Map(savedMembers.map((member) => [member.name.trim().toLowerCase(), member]));
  const addedByName = new Map<string, Member>();
  const party = editedMembers
    .filter((member) => selected.has(member.id) && member.name.trim())
    .map((member) => {
      const name = member.name.trim();
      const key = name.toLowerCase();
      const saved = savedByName.get(key);
      if (saved) return saved;
      const added = addedByName.get(key);
      if (added) return added;
      const replacement = savedMembers.some((candidate) => candidate.id === member.id)
        ? { id: makeId(), name, active: member.active }
        : { ...member, name };
      addedByName.set(key, replacement);
      return replacement;
    });
  const uniqueParty = [...new Map(party.map((member) => [member.id, member])).values()];
  return {
    memberIds: uniqueParty.map((member) => member.id),
    members: [...savedMembers, ...uniqueParty.filter((member) => !savedMembers.some((saved) => saved.id === member.id))],
  };
}
