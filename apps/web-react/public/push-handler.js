self.addEventListener('push', (event) => {
  const notification = event.data?.json()?.notification;
  if (!notification) return;

  event.waitUntil(self.registration.showNotification(notification.title, notification));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.onActionClick?.default?.url;
  if (url) event.waitUntil(self.clients.openWindow(url));
});
