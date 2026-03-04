"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

/**
 * Returns the backend JWT when the user is signed in.
 * Fetches from /api/auth/backend-token when session exists.
 */
export function useAuthToken(): {
  token: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const { data: session, status } = useSession();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchToken = useCallback(async () => {
    if (status !== "authenticated" || !session?.user) {
      setToken(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/backend-token", { credentials: "include" });
      if (!res.ok) {
        setToken(null);
        return;
      }
      const data = await res.json();
      setToken(data.token ?? null);
    } catch {
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, [session?.user, status]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  return { token, isLoading: loading, refresh: fetchToken };
}
