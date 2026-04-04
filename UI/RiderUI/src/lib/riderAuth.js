const AUTH_STORAGE_KEY = "rider_supabase_auth";
const AUTH_EVENT = "rider-auth-changed";

function getSupabaseConfig() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL || "",
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
  };
}

export function isRiderAuthConfigured() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

function emitAuthChanged(auth) {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: auth }));
}

function persistAuth(auth) {
  if (!auth) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    emitAuthChanged(null);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  emitAuthChanged(auth);
}

export function getStoredRiderAuth() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function getCurrentRider() {
  return getStoredRiderAuth()?.user || null;
}

export function getCurrentRiderId() {
  return getCurrentRider()?.id || "";
}

function getAuthHeaders() {
  const { anonKey } = getSupabaseConfig();
  return {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };
}

async function readSupabaseError(resp) {
  const data = await resp.json().catch(() => ({}));
  return data.msg || data.error_description || data.error || `Request failed (${resp.status})`;
}

function normalizeAuthPayload(data) {
  return {
    user: data.user || data.session?.user || null,
    accessToken: data.access_token || data.session?.access_token || null,
    refreshToken: data.refresh_token || data.session?.refresh_token || null,
    expiresAt: data.expires_at || data.session?.expires_at || null,
  };
}

export async function signInRider({ email, password }) {
  const { url } = getSupabaseConfig();
  const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) {
    throw new Error(await readSupabaseError(resp));
  }
  const data = normalizeAuthPayload(await resp.json());
  if (!data.user) {
    throw new Error("Supabase did not return a rider profile.");
  }
  persistAuth(data);
  return data.user;
}

export async function signUpRider({ email, password }) {
  const { url } = getSupabaseConfig();
  const resp = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) {
    throw new Error(await readSupabaseError(resp));
  }
  const data = normalizeAuthPayload(await resp.json());
  if (data.user && data.accessToken) {
    persistAuth(data);
  }
  return data;
}

export function signOutRider() {
  persistAuth(null);
}

export function subscribeToRiderAuth(listener) {
  function handleCustomEvent(event) {
    listener(event.detail || null);
  }

  function handleStorage(event) {
    if (event.key === AUTH_STORAGE_KEY) {
      listener(getStoredRiderAuth());
    }
  }

  window.addEventListener(AUTH_EVENT, handleCustomEvent);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(AUTH_EVENT, handleCustomEvent);
    window.removeEventListener("storage", handleStorage);
  };
}
