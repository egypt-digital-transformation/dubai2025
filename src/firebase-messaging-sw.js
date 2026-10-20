importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

// Initialize Firebase inside Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyDLFKthhuoBAreHk6QN2w6sRRZmDratMWk",
  authDomain: "mea-egypt-tv-sso-prd.firebaseapp.com",
  databaseURL: "https://mea-egypt-tv-sso-prd-default-rtdb.firebaseio.com",
  projectId: "mea-egypt-tv-sso-prd",
  storageBucket: "mea-egypt-tv-sso-prd.firebasestorage.app",
  messagingSenderId: "54851020508",
  appId: "1:54851020508:web:36878d3e8ac15d3630f619",
  measurementId: "G-8H04P90GW8"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const title = payload.notification?.title || payload.data?.title || 'Ahlan Companion';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: payload.notification?.icon || '/assets/icon/favicon.png',
    badge: '/assets/icon/favicon.png',
    data: payload.data || {},
  };

  self.registration.showNotification(title, options);
});

// Handle notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event.notification);
  event.notification.close();

  const targetUrl = event.notification.data?.url || event.notification.data?.link || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
