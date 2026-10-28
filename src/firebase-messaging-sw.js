importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

// Initialize Firebase inside Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyBamzLLaALQlR0nkN5nlIttLt-XmdFF1J0",
  authDomain: "mea-egypt-ahlanapp-prd.firebaseapp.com",
  projectId: "mea-egypt-ahlanapp-prd",
  storageBucket: "mea-egypt-ahlanapp-prd.firebasestorage.app",
  messagingSenderId: "107201585408",
  appId: "1:107201585408:web:45f4aaa5690d72e5a693e5",
  measurementId: "G-MNX0Y34XMN"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  // Firebase displays notification payloads automatically in the background.
  if (payload.notification) {
    return;
  }

  const title = payload.notification?.title || payload.data?.title || 'Ahlan Companion';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: payload.notification?.icon || '/assets/app-icon-192.png',
    badge: '/assets/app-icon-48.png',
    data: payload.data || {},
  };

  self.registration.showNotification(title, options);
});

// Handle notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event.notification);
  event.stopImmediatePropagation();
  event.notification.close();

  const fcmMessage = event.notification.data?.FCM_MSG;
  const messageData = fcmMessage?.data?.data || fcmMessage?.data || {};
  const targetUrl =
    event.notification.data?.url ||
    event.notification.data?.link ||
    messageData.url ||
    messageData.link ||
    fcmMessage?.fcmOptions?.link ||
    '/';
  const destination = new URL(targetUrl, self.location.origin);
  if (destination.origin !== self.location.origin) {
    console.error('[firebase-messaging-sw.js] Ignoring notification URL outside this app origin:', targetUrl);
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.navigate(destination.href).then(() => client.focus());
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(destination.href);
      }
    })
  );
});
