export type UpdateManifest = { version: string; downloadUrl: string; sha256: string; summary?: string };

export const GITHUB_UPDATE_MANIFEST = "https://raw.githubusercontent.com/CarlvinJerry/TheBarCode/release/release/latest.json";
const OFFICIAL_MANIFESTS = [
  GITHUB_UPDATE_MANIFEST,
  "https://thebarcode.beyondrawdata.com/releases/lite/latest.json",
  "https://thebarcode.beyondrawdata.co.ke/releases/lite/latest.json",
];
const DRIVE_FOLDER = "https://drive.google.com/drive/folders/1IzlVfcc9nDLh_mdpndCANs1ThsKDHLS9";

export function compareVersions(left: string, right: string) {
  const a = left.replace(/^v/i, "").split(/[.-]/).map(x => Number.parseInt(x, 10) || 0);
  const b = right.replace(/^v/i, "").split(/[.-]/).map(x => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference) return difference;
  }
  return 0;
}

function isDriveFolder(value: string) { return value.toLowerCase().startsWith(DRIVE_FOLDER.toLowerCase()); }
function validManifest(value: any): value is UpdateManifest {
  if (!value || typeof value.version !== "string" || typeof value.downloadUrl !== "string" || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256)) return false;
  try { return new URL(value.downloadUrl).protocol === "https:"; } catch { return false; }
}

export async function fetchLatestUpdate(configured?: string): Promise<UpdateManifest | undefined> {
  if (!navigator.onLine) return undefined;
  const candidates = [...OFFICIAL_MANIFESTS, configured || localStorage.getItem("update_manifest_url") || ""]
    .filter((url, index, all): url is string => Boolean(url) && !isDriveFolder(url) && all.indexOf(url) === index);
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:") continue;
      const response = await fetch(parsed, { cache: "no-store", signal: AbortSignal.timeout(7000) });
      if (!response.ok) continue;
      const manifest = await response.json();
      if (validManifest(manifest)) return manifest;
    } catch { /* Keep checking the remaining approved release sources. */ }
  }
  return undefined;
}

export function deferUpdateForSession(version: string) {
  sessionStorage.setItem("thebarcode_update_deferred_version", version);
}
export function isUpdateDeferred(version: string) {
  return sessionStorage.getItem("thebarcode_update_deferred_version") === version;
}
