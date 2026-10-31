// Service worker: nhận thông báo đẩy và mở đúng màn hình khi bấm (Phần 3.7).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Ship Quanh Tôi', body: 'Bạn có cập nhật mới', url: '/' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (_) {}
  const urgent = /Đơn mới|chuyến mới|chờ bạn nhận/i.test(data.title);
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: true,
      requireInteraction: urgent,
      vibrate: urgent ? [400, 200, 400, 200, 400] : [200],
      icon: 'icons/Icon-192.png',
      badge: 'icons/Icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
