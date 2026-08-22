export const displayScales = {
  Compact: 0.88,
  Standard: 1,
  Large: 1.12,
  "Extra large": 1.25,
} as const;

export type DisplayScaleName = keyof typeof displayScales;

export function applyDisplayScale(name: DisplayScaleName) {
  const scale = displayScales[name] ?? 1;
  document.documentElement.dataset.displayScale = name.toLowerCase().replace(" ", "-");
  document.documentElement.style.setProperty("--ui-scale", String(scale));
  document.documentElement.style.zoom = String(scale);
}

export function storedDisplayScale(): DisplayScaleName {
  const stored = localStorage.getItem("display_scale") as DisplayScaleName | null;
  return stored && stored in displayScales ? stored : "Standard";
}

export function saveDisplayScale(name: DisplayScaleName) {
  localStorage.setItem("display_scale", name);
  applyDisplayScale(name);
}
