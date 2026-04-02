/**
 * Haptic feedback for iOS (Capacitor). No-op on web.
 * Provides selection, impact (light/medium/heavy), and notification haptics.
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

/** Medium impact — e.g. pin/unpin a match, toggle tracking */
export async function hapticMediumImpact(): Promise<void> {
  const H = await getHaptics();
  if (H) {
    try {
      await H.Haptics.impact({ style: H.ImpactStyle.Medium });
    } catch {
      // Silent failure
    }
  }
}

/** Heavy impact — e.g. goal scored, important event */
export async function hapticHeavyImpact(): Promise<void> {
  const H = await getHaptics();
  if (H) {
    try {
      await H.Haptics.impact({ style: H.ImpactStyle.Heavy });
    } catch {
      // Silent failure
    }
  }
}

/** Success notification — e.g. game tracked successfully */
export async function hapticSuccess(): Promise<void> {
  const H = await getHaptics();
  if (H) {
    try {
      await H.Haptics.notification({ type: H.NotificationType.Success });
    } catch {
      // Silent failure
    }
  }
}

/** Warning notification — e.g. max pinned reached */
export async function hapticWarning(): Promise<void> {
  const H = await getHaptics();
  if (H) {
    try {
      await H.Haptics.notification({ type: H.NotificationType.Warning });
    } catch {
      // Silent failure
    }
  }
}

/** Error notification — e.g. action failed */
export async function hapticError(): Promise<void> {
  const H = await getHaptics();
  if (H) {
    try {
      await H.Haptics.notification({ type: H.NotificationType.Error });
    } catch {
      // Silent failure
    }
  }
}
