import { useState, useEffect, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/apiConfig";

interface User {
  id: string;
  username: string;
  displayName: string;
  publicKey: string;
  avatarUrl?: string | null;
  bio?: string | null;
  walletAddress?: string | null;
  createdAt?: string;
  sessionExpiry?: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAuth = useCallback(async (tries: number, cancelled: { current: boolean }) => {
    try {
      const res = await fetch(apiUrl("/api/auth/me"), {
        credentials: "include",
      });

      if (cancelled.current) return;

      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setIsAuthenticated(true);
        setIsLoading(false);
      } else if (res.status === 401) {
        setUser(null);
        setIsAuthenticated(false);
        setIsLoading(false);
      } else {
        if (tries > 0) {
          retryTimer.current = setTimeout(() => checkAuth(tries - 1, cancelled), 1500);
        } else {
          setIsLoading(false);
        }
      }
    } catch {
      if (cancelled.current) return;
      if (tries > 0) {
        retryTimer.current = setTimeout(() => checkAuth(tries - 1, cancelled), 1500);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    const cancelled = { current: false };
    checkAuth(4, cancelled);
    return () => {
      cancelled.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [checkAuth]);

  const login = useCallback((_unused?: string, sessionExpiry?: string | null) => {
    setIsAuthenticated(true);
    const cancelled = { current: false };
    checkAuth(2, cancelled);
    if (sessionExpiry !== undefined) {
      setUser(prev => prev ? { ...prev, sessionExpiry } : prev);
    }
  }, [checkAuth]);

  const logout = useCallback(() => {
    fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = "/";
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...patch } : prev);
  }, []);

  const refreshSession = useCallback(async (durationDays: number): Promise<{ ok: boolean; error?: string }> => {
    if (!isAuthenticated) return { ok: false, error: "Не авторизован" };

    try {
      const res = await fetch(apiUrl("/api/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ durationDays }),
      });

      const data = await res.json();

      if (!res.ok) return { ok: false, error: data.error ?? "Ошибка обновления" };

      setUser(prev => prev ? { ...prev, sessionExpiry: data.sessionExpiry ?? null } : prev);
      return { ok: true };
    } catch {
      return { ok: false, error: "Сетевая ошибка" };
    }
  }, [isAuthenticated]);

  return { user, token: isAuthenticated ? "__cookie__" : null, isLoading, login, logout, updateUser, refreshSession };
}
