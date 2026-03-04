/**
 * Capacitor iOS push notification integration.
 *
 * - On app load: register action listener so tap → deep link works when app is cold-started.
 * - On first user interaction: request permission, register for remote notifications,
 *   capture APNs token, POST to backend /v1/notifications/ios/register-token.
 *
 * Prerequisites:
 * 1. npm install @capacitor/push-notifications
 * 2. npx cap sync ios
 * 3. Enable Push Notifications + Background Modes → Remote notifications in Xcode
 * 4. Add APNs credentials to backend env vars
 */

import { getApiBase } from "./api";
import { getDeviceIdAsync, ensureDeviceRegistered } from "./device";

function isCapacitorIOS(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return cap?.getPlatform?.() === "ios";
}

/**
 * Register listener for notification tap. Call early (e.g. root layout) so deep link
 * works when app is cold-started from a push tap.
 */
export function registerPushActionListener(): void {
  if (!isCapacitorIOS()) return;
  import("@capacitor/push-notifications").then(({ PushNotifications }) => {
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = action.notification.data as Record<string, unknown> | undefined;
      const url = data?.url ?? (data?.data as Record<string, unknown> | undefined)?.url;
      const urlStr = typeof url === "string" ? url : null;
      if (urlStr && urlStr.startsWith("/") && typeof window !== "undefined") {
        window.location.href = urlStr;
      }
    });
  }).catch(() => {});
}

/**
 * Initialize Capacitor push notifications.
 * Call this once on app startup inside the iOS app.
 */
export async function initCapacitorPush(): Promise<void> {
  if (!isCapacitorIOS()) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") {
      console.log("[cap-push] Permission not granted");
      return;
    }
    const { hapticLightImpact } = await import("./haptics");
    hapticLightImpact().catch(() => {});

    await PushNotifications.register();

    PushNotifications.addListener("registration", async (token) => {
      console.log("[cap-push] APNs token:", token.value.substring(0, 12) + "...");
      await ensureDeviceRegistered();
      const deviceId = await getDeviceIdAsync();
      if (!deviceId) return;

      await fetch(`${getApiBase()}/v1/notifications/ios/register-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          apns_token: token.value,
          bundle_id: "com.liveview.tracker",
        }),
      }).catch((err) => console.error("[cap-push] Token sync failed:", err));
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.error("[cap-push] Registration error:", err);
    });

    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      console.log("[cap-push] Received:", notification.title);
    });

    // Action listener also registered early via registerPushActionListener() for cold start
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = action.notification.data as Record<string, unknown> | undefined;
      const url = data?.url ?? (data?.data as { url?: string } | undefined)?.url;
      const urlStr = typeof url === "string" ? url : null;
      if (urlStr && urlStr.startsWith("/") && typeof window !== "undefined") {
        window.location.href = urlStr;
      }
    });
  } catch (err) {
    console.warn("[cap-push] Not available:", err);
  }
}
