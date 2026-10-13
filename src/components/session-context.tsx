"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface SessionAccount {
  id: string;
  name: string;
  email: string;
  /** "member" | "readonly" for users, "operator" for the operator portal. */
  role: "member" | "readonly" | "operator";
}

const SessionContext = createContext<SessionAccount | null>(null);

export function SessionProvider({ account, children }: { account: SessionAccount; children: ReactNode }) {
  return <SessionContext.Provider value={account}>{children}</SessionContext.Provider>;
}

/** Signed-in account of the current portal (set by the portal's server layout). */
export function useAccount(): SessionAccount {
  const account = useContext(SessionContext);
  if (!account) throw new Error("useAccount must be used inside a portal layout");
  return account;
}
