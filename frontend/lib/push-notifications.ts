/**
 * Web Push notification system.
 *
 * Handles permission requests, PushManager subscription with VAPID,
 * and backend subscription sync.
 */

import { getApiBase } from "./api";
import { getDeviceId } from "./device";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "default";
  return Notification.permission;
}

export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * Subscribe to web push notifications via the browser's PushManager
 * and register the subscription with the backend.
 */
export async function subscribeToWebPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (Notification.permission !== "granted") {
    const granted = await requestPushPermission();
    if (!granted) return false;
  }
  if (!VAPID_PUBLIC_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set");
    }
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await syncSubscriptionToBackend(existing);
      return true;
    }

    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });

    await syncSubscriptionToBackend(subscription);
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[push] Subscribe failed:", err);
    }
    return false;
  }
}

/**
 * Unsubscribe from web push and notify the backend.
 */
export async function unsubscribeFromWebPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const deviceId = getDeviceId();
    if (deviceId) {
      await fetch(`${getApiBase()}/v1/notifications/webpush/unsubscribe`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          endpoint: subscription.endpoint,
        }),
      }).catch(() => {});
    }
    await subscription.unsubscribe();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[push] Unsubscribe failed:", err);
    }
  }
}

async function syncSubscriptionToBackend(subscription: PushSubscription): Promise<void> {
  const deviceId = getDeviceId();
  if (!deviceId) return;

  const key = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!key || !auth) return;

  await fetch(`${getApiBase()}/v1/notifications/webpush/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: deviceId,
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(key),
        auth: arrayBufferToBase64(auth),
      },
      user_agent: navigator.userAgent,
    }),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Send a local (in-page) notification as a fallback. */
export function sendLocalNotification(title: string, body: string, icon?: string): void {
  if (getPushPermission() !== "granted") return;
  try {
    const notif = new Notification(title, {
      body,
      icon: icon || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "lv-score-" + Date.now(),
      silent: false,
    });
    setTimeout(() => notif.close(), 8000);
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch {
    // Notifications not supported in this context
  }
}
