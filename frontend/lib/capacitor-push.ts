/**
 * Capacitor iOS push notification integration.
 *
 * Registers for APNs push notifications when running inside the iOS app,
 * and sends the device token to the backend.
 *
 * Prerequisites:
 * 1. npm install @capacitor/push-notifications
 * 2. npx cap sync ios
 * 3. Enable Push Notifications capability in Xcode
 * 4. Add APNs credentials to backend env vars
 */

import { getApiBase } from "./api";
import { getDeviceId, ensureDeviceRegistered } from "./device";

function isCapacitorIOS(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return cap?.getPlatform?.() === "ios";
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

    await PushNotifications.register();

    PushNotifications.addListener("registration", async (token) => {
      console.log("[cap-push] APNs token:", token.value.substring(0, 12) + "...");
      await ensureDeviceRegistered();
      const deviceId = getDeviceId();
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

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = action.notification.data;
      if (data?.url && typeof window !== "undefined") {
        window.location.href = data.url;
      }
    });
  } catch (err) {
    console.warn("[cap-push] Not available:", err);
  }
}
