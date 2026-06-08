// ============================================================
//  AuthContext.tsx — Role-based auth (Admin / Auditor)
//  Drop into src/context/AuthContext.tsx
// ============================================================

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'admin' | 'auditor';

export interface AuthUser {
  id:       string;   // e.g. 'admin', 'rajesh.kumar'
  name:     string;   // display name
  email:    string;
  role:     UserRole;
}

interface AuthCtx {
  user:    AuthUser | null;
  login:   (user: AuthUser) => void;
  logout:  () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthCtx>({
  user: null, login: () => {}, logout: () => {}, isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

const STORAGE_KEY = 'auditAppUser';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const login = (u: AuthUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}