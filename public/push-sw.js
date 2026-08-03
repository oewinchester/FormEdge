self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "FormEdge", body: event.data ? event.data.text() : "Yeni bildirim" };
  }
  const title = typeof payload.title === "string" ? payload.title : "FormEdge";
  const body = typeof payload.body === "string" ? payload.body : "Yeni bildirim";
  const href = typeof payload.href === "string" && payload.href.startsWith("/")
    ? payload.href
    : "/dashboard/notifications";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: typeof payload.eventType === "string" ? `formedge-${payload.eventType}` : "formedge-update",
    renotify: payload.priority === "critical",
    data: { href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data && typeof event.notification.data.href === "string"
    ? event.notification.data.href
    : "/dashboard/notifications";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(href);
        return client.focus();
      }
    }
    return self.clients.openWindow(href);
  })());
});
