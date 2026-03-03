/**
 * Custom Service Worker extensions for LiveView push notifications.
 *
 * next-pwa generates sw.js from Workbox; this file adds push event handlers.
 * Import via next.config.js importScripts.
 */

// Handle incoming push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "LiveView",
      body: event.data.text(),
    };
  }

  const title = payload.title || "LiveView";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
    tag: payload.tag || "lv-notification",
    renotify: true,
    data: payload.data || {},
    actions: [
      { action: "open", title: "View Match" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click — deep link to the match
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const data = event.notification.data || {};
  const url = data.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Handle notification close (for analytics if needed)
self.addEventListener("notificationclose", (event) => {
  // No-op for now; can track dismiss rates later
});
