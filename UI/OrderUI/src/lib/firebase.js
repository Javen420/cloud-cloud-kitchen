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
let serviceWorkerRegistration;

function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

function buildServiceWorkerUrl(config) {
  const params = new URLSearchParams();
  Object.entries(config).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

async function ensureMessagingServiceWorker() {
  if (serviceWorkerRegistration) return serviceWorkerRegistration;
  if (!("serviceWorker" in navigator)) return null;

  const config = getFirebaseConfig();
  const swUrl = buildServiceWorkerUrl(config);
  serviceWorkerRegistration = await navigator.serviceWorker.register(swUrl, { scope: "/" });
  return serviceWorkerRegistration;
}

export async function initFirebaseMessaging() {
  if (app && messaging) return { app, messaging };

  const supported = await isSupported();
  if (!supported) return { app: null, messaging: null };

  app = initializeApp(firebaseConfig);
  messaging = getMessaging(app);
  return { app, messaging };
}

export async function getFcmRegistrationToken({ requestPermission = true } = {}) {
  const { messaging } = await initFirebaseMessaging();
  if (!messaging) return null;

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("Missing VITE_FIREBASE_VAPID_KEY");

  if (typeof Notification === "undefined") return null;

  let permission = Notification.permission;
  if (permission === "default" && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return null;

  const registration = await ensureMessagingServiceWorker();
  return await getToken(messaging, {
    vapidKey,
    ...(registration ? { serviceWorkerRegistration: registration } : {}),
  });
}

export async function onForegroundMessage(handler) {
  const { messaging } = await initFirebaseMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, handler);
}

