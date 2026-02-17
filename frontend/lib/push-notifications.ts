const VAPID_STORAGE_KEY = "lv_push_sub";

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

export function sendLocalNotification(title: string, body: string, icon?: string): void {
  if (getPushPermission() !== "granted") return;

  try {
    const notif = new Notification(title, {
      body,
      icon: icon || "/icons/logo.png",
      badge: "/icons/logo.png",
      tag: "lv-score-" + Date.now(),
      renotify: true,
      silent: false,
    });

    // Auto close after 8 seconds
    setTimeout(() => notif.close(), 8000);

    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch {
    // Notifications not supported in this context
  }
}