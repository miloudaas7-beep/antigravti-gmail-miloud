"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type ConnectedAccount = {
  id: string;
  email: string;
  provider: "gmail";
  isPrimary: boolean;
};

interface MultiAccountContextType {
  accounts: ConnectedAccount[];
  activeAccountId: string | null;
  addAccount: (email: string) => void;
  switchAccount: (id: string) => void;
}

const MultiAccountContext = createContext<MultiAccountContextType | undefined>(undefined);

export function MultiAccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  useEffect(() => {
    // Load from local storage for seamless switching
    const stored = localStorage.getItem("smartscout_sender_accounts");
    const active = localStorage.getItem("smartscout_active_account");
    if (stored) {
      const parsed = JSON.parse(stored);
      setAccounts(parsed);
      if (active && parsed.find((a: any) => a.id === active)) {
        setActiveAccountId(active);
      } else if (parsed.length > 0) {
        setActiveAccountId(parsed[0].id);
      }
    }
  }, []);

  useEffect(() => {
    if (accounts.length > 0) {
      localStorage.setItem("smartscout_sender_accounts", JSON.stringify(accounts));
    }
    if (activeAccountId) {
      localStorage.setItem("smartscout_active_account", activeAccountId);
    }
  }, [accounts, activeAccountId]);

  const addAccount = (email: string) => {
    const newId = Math.random().toString(36).substring(7);
    const newAcc: ConnectedAccount = { id: newId, email, provider: "gmail", isPrimary: accounts.length === 0 };
    setAccounts(prev => [...prev, newAcc]);
    setActiveAccountId(newId);
  };

  const switchAccount = (id: string) => {
    setActiveAccountId(id);
  };

  return (
    <MultiAccountContext.Provider value={{ accounts, activeAccountId, addAccount, switchAccount }}>
      {children}
    </MultiAccountContext.Provider>
  );
}

export function useMultiAccount() {
  const context = useContext(MultiAccountContext);
  if (context === undefined) {
    throw new Error("useMultiAccount must be used within a MultiAccountProvider");
  }
  return context;
}
