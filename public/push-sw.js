// Loaded into the app's service worker (see workbox.importScripts in
// vite.config.js). Shows the "rest over" push sent by server/ and opens the
// app when it is tapped.
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Rest over", {
      body: data.body || "Time for your next set.",
      icon: "pwa-192x192.png",
      badge: "pwa-192x192.png",
      tag: "pdash-rest",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => "focus" in c);
      return open ? open.focus() : self.clients.openWindow("./");
    })
  );
});
