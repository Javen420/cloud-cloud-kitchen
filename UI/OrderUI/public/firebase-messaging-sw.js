/* global importScripts */
importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js");

const swUrl = new URL(self.location.href);
const firebaseConfig = {
  apiKey: swUrl.searchParams.get("apiKey") || self.FIREBASE_API_KEY,
  authDomain: swUrl.searchParams.get("authDomain") || self.FIREBASE_AUTH_DOMAIN,
  projectId: swUrl.searchParams.get("projectId") || self.FIREBASE_PROJECT_ID,
  storageBucket: swUrl.searchParams.get("storageBucket") || self.FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    swUrl.searchParams.get("messagingSenderId") || self.FIREBASE_MESSAGING_SENDER_ID,
  appId: swUrl.searchParams.get("appId") || self.FIREBASE_APP_ID,
};

function hasConfig(config) {
  return Boolean(
    config.apiKey &&
      config.projectId &&
      config.messagingSenderId &&
      config.appId,
  );
}

if (hasConfig(firebaseConfig)) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || "Order update";
    const body =
      payload?.notification?.body ||
      payload?.data?.message ||
      "Your order status updated.";

    self.registration.showNotification(title, {
      body,
      data: payload?.data || {},
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const orderId = event.notification?.data?.order_id;
  const targetUrl = orderId ? `/customer/track/${orderId}` : "/customer";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});

