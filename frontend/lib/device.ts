/**
 * Device registration and identity management.
 *
 * Generates a stable device_id on first visit, persists it in localStorage,
 * and registers with the backend notification system.
 */

import { getApiBase } from "./api";

const DEVICE_ID_KEY = "lv_device_id";

export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEVICE_ID_KEY);
}

function setDeviceId(id: string): void {
  localStorage.setItem(DEVICE_ID_KEY, id);
}

function getPlatform(): "web" | "ios" {
  if (typeof window !== "undefined") {
    const cap = (window as any).Capacitor;
    if (cap?.getPlatform?.() === "ios") return "ios";
  }
  return "web";
}

/**
 * Ensure the device is registered with the backend.
 * Creates a new device on first call, re-registers on subsequent calls.
 * Returns the stable device_id.
 */
export async function ensureDeviceRegistered(): Promise<string> {
  const existing = getDeviceId();
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
    setDeviceId(data.device_id);
    return data.device_id;
  } catch (e) {
    if (existing) return existing;
    throw e;
  }
}
