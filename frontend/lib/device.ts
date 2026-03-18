/**
 * Device registration and identity management.
 *
 * Generates a stable device_id (UUID) once and persists it:
 * - web: localStorage
 * - iOS: Capacitor Preferences (survives reinstall within same app group)
 *
 * Include device_id in all notification/tracking API calls.
 */

import { getApiBase } from "./api";

const DEVICE_ID_KEY = "lv_device_id";

interface CapacitorBridge {
  getPlatform?: () => string;
}

interface WindowWithCapacitor extends Window {
  Capacitor?: CapacitorBridge;
  __lv_device_id?: string;
}

function isCapacitorIOS(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as WindowWithCapacitor).Capacitor;
  return cap?.getPlatform?.() === "ios";
}

/** Generate a new UUID v4 for device_id */
function generateDeviceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get stored device_id. Returns null if not yet set.
 * - Web: reads from localStorage
 * - iOS: reads from Capacitor Preferences (async; use getDeviceIdSync for sync path)
 */
export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  if (isCapacitorIOS()) {
    // On iOS we use Preferences but this sync getter can't await.
    // Caller that needs iOS id should use ensureDeviceRegistered() or getDeviceIdAsync().
    const stored = (window as WindowWithCapacitor).__lv_device_id;
    return stored ?? null;
  }
  return localStorage.getItem(DEVICE_ID_KEY);
}

/**
 * Get device_id (async). On iOS loads from Capacitor Preferences.
 * Use when you need the ID and may be on iOS.
 */
export async function getDeviceIdAsync(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (isCapacitorIOS()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: DEVICE_ID_KEY });
      if (value) (window as WindowWithCapacitor).__lv_device_id = value;
      return value ?? null;
    } catch {
      return null;
    }
  }
  return localStorage.getItem(DEVICE_ID_KEY);
}

async function setDeviceIdIOS(id: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: DEVICE_ID_KEY, value: id });
    (window as WindowWithCapacitor).__lv_device_id = id;
  } catch {
    // Fallback to localStorage if Preferences unavailable
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
}

function setDeviceIdWeb(id: string): void {
  localStorage.setItem(DEVICE_ID_KEY, id);
}

function getPlatform(): "web" | "ios" {
  if (typeof window !== "undefined") {
    const cap = (window as WindowWithCapacitor).Capacitor;
    if (cap?.getPlatform?.() === "ios") return "ios";
  }
  return "web";
}

/**
 * Ensure the device is registered with the backend.
 * Creates a new device_id on first run (UUID), persists it, then registers with the API.
 * Returns the stable device_id.
 */
export async function ensureDeviceRegistered(): Promise<string> {
  let existing: string | null = null;
  if (isCapacitorIOS()) {
    existing = await getDeviceIdAsync();
  } else {
    existing = getDeviceId();
  }

  const platform = getPlatform();

  try {
    const res = await fetch(`${getApiBase()}/v1/devices/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        device_id: existing,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    });

    if (!res.ok) throw new Error(`Device registration failed: ${res.status}`);

    const data = await res.json();
    const deviceId = data.device_id as string;

    if (isCapacitorIOS()) {
      await setDeviceIdIOS(deviceId);
    } else {
      setDeviceIdWeb(deviceId);
    }
    return deviceId;
  } catch (e) {
    if (existing) return existing;
    throw e;
  }
}

/**
 * Get or create a local device_id without calling the backend.
 * Used when we need an ID before registration (e.g. to send with register-token).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (isCapacitorIOS()) {
    const existing = await getDeviceIdAsync();
    if (existing) return existing;
    const newId = generateDeviceId();
    await setDeviceIdIOS(newId);
    return newId;
  }
  let existing = getDeviceId();
  if (existing) return existing;
  const newId = generateDeviceId();
  setDeviceIdWeb(newId);
  return newId;
}
