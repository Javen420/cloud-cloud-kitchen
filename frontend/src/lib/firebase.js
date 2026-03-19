import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app;
let messaging;

export async function initFirebaseMessaging() {
  if (app && messaging) return { app, messaging };

  const supported = await isSupported();
  if (!supported) return { app: null, messaging: null };

  app = initializeApp(firebaseConfig);
  messaging = getMessaging(app);
  return { app, messaging };
}

export async function getFcmRegistrationToken() {
  const { messaging } = await initFirebaseMessaging();
  if (!messaging) return null;

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("Missing VITE_FIREBASE_VAPID_KEY");

  // Request permission in the browser
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  return await getToken(messaging, { vapidKey });
}

export async function onForegroundMessage(handler) {
  const { messaging } = await initFirebaseMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, handler);
}

