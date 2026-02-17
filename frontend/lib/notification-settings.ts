const KEY = "lv_sound_enabled";

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const val = localStorage.getItem(KEY);
    return val === null ? true : val === "true"; // On by default
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, String(enabled));
  } catch {}
}