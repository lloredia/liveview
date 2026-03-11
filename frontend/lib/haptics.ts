/**
 * Haptic feedback for iOS (Capacitor). No-op on web.
 * Use selection or light impact only for subtle feedback.
 */

interface WindowWithCapacitor extends Window {
  Capacitor?: { getPlatform?: () => string };
}

function isCapacitorIOS(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as WindowWithCapacitor).Capacitor;
  return cap?.getPlatform?.() === "ios";
}

let hapticsModule: typeof import("@capacitor/haptics") | null = null;

async function getHaptics(): Promise<typeof import("@capacitor/haptics") | null> {
  if (!isCapacitorIOS()) return null;
  if (hapticsModule) return hapticsModule;
  try {
    hapticsModule = await import("@capacitor/haptics");
    return hapticsModule;
  } catch {
    return null;
  }
}

/** Light tap — e.g. track toggle, favorite toggle, list selection */
export async function hapticSelection(): Promise<void> {
  const H = await getHaptics();
  if (H) {
    try {
      await H.Haptics.selectionChanged();
    } catch {
      // Silent failure
    }
  }
}

/** Slightly stronger — e.g. pull-to-refresh trigger, permission granted */
export async function hapticLightImpact(): Promise<void> {
  const H = await getHaptics();
  if (H) {
    try {
      await H.Haptics.impact({ style: H.ImpactStyle.Light });
    } catch {
      // Silent failure
    }
  }
}
