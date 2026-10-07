const maxImageLength = 700_000;

export function normalizeLootImages(images: Record<string, string> | null | undefined) {
  const normalized = new Map<string, { name: string; image: string }>();
  Object.entries(images ?? {}).forEach(([rawName, rawImage]) => {
    const name = rawName.trim();
    const image = typeof rawImage === "string" ? rawImage.trim() : "";
    if (!name || !image.startsWith("data:image/") || image.length > maxImageLength) return;
    normalized.set(name.toLowerCase(), { name, image });
  });
  return Object.fromEntries([...normalized.values()].map(({ name, image }) => [name, image]));
}

export function lootImageFor(images: Record<string, string> | null | undefined, lootName: string) {
  const key = lootName.trim().toLowerCase();
  return Object.entries(normalizeLootImages(images)).find(([name]) => name.toLowerCase() === key)?.[1] ?? "";
}

export function setLootImage(images: Record<string, string> | null | undefined, lootName: string, image: string) {
  const name = lootName.trim();
  const key = name.toLowerCase();
  const next = Object.fromEntries(Object.entries(normalizeLootImages(images)).filter(([candidate]) => candidate.toLowerCase() !== key));
  if (name && image.startsWith("data:image/") && image.length <= maxImageLength) next[name] = image;
  return next;
}
