"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { getApiBase } from "@/lib/api";
const TOKEN_KEY = "lv_token";
const USER_KEY = "lv_user";

interface User {
  id: string;
  email: string;
  username: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  authFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: async () => {},
  signup: async () => {},
  logout: () => {},
  authFetch: async () => new Response(),
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load saved session
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedUser = localStorage.getItem(USER_KEY);
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch {}
    setLoading(false);
  }, []);

  const saveSession = useCallback((t: string, u: User) => {
    setToken(t);
    setUser(u);
    try {
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    } catch {}
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  }, []);

  const signup = useCallback(async (email: string, username: string, password: string) => {
    const res = await fetch(`${getApiBase()}/v1/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || data.message || "Signup failed");
    }
    const data = await res.json();
    saveSession(data.token, data.user);
  }, [saveSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${getApiBase()}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || data.message || "Login failed");
    }
    const data = await res.json();
    saveSession(data.token, data.user);
  }, [saveSession]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const authFetch = useCallback(async (path: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    headers.set("Content-Type", "application/json");
    return fetch(`${getApiBase()}${path}`, { ...options, headers });
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}