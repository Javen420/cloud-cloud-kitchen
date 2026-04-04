import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  getStoredRiderAuth,
  isRiderAuthConfigured,
  signInRider,
  signOutRider,
  signUpRider,
  subscribeToRiderAuth,
} from "./riderAuth";

const RiderAuthContext = createContext(null);

export function RiderAuthProvider({ children }) {
  const [auth, setAuth] = useState(() => getStoredRiderAuth());

  useEffect(() => subscribeToRiderAuth(setAuth), []);

  const value = useMemo(
    () => ({
      auth,
      rider: auth?.user || null,
      isConfigured: isRiderAuthConfigured(),
      signIn: signInRider,
      signUp: signUpRider,
      signOut: signOutRider,
    }),
    [auth],
  );

  return <RiderAuthContext.Provider value={value}>{children}</RiderAuthContext.Provider>;
}

export function useRiderAuth() {
  const context = useContext(RiderAuthContext);
  if (!context) {
    throw new Error("useRiderAuth must be used within RiderAuthProvider.");
  }
  return context;
}
