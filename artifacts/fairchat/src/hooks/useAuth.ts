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

const SESSION_CHECK_RETRIES = 2;
const SESSION_CHECK_RETRY_MS = 800;

function isUnauthenticatedStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const checkAuth = useCallback(async (signal: AbortSignal, triesLeft: number): Promise<void> => {
    try {
      const res = await fetch(apiUrl("/api/auth/me"), {
        credentials: "include",
        signal,
      });

      if (signal.aborted || !mountedRef.current) return;

      if (res.ok) {
        const data = (await res.json()) as User;
        if (signal.aborted || !mountedRef.current) return;
        setUser(data);
        setIsAuthenticated(true);
        return;
      }

      if (isUnauthenticatedStatus(res.status)) {
        clearSession();
        return;
      }

      if (triesLeft > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, SESSION_CHECK_RETRY_MS);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
        if (signal.aborted || !mountedRef.current) return;
        return checkAuth(signal, triesLeft - 1);
      }

      clearSession();
    } catch (err) {
      if (signal.aborted || !mountedRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;

      if (triesLeft > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, SESSION_CHECK_RETRY_MS);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
        if (signal.aborted || !mountedRef.current) return;
        return checkAuth(signal, triesLeft - 1);
      }

      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    (async () => {
      setIsLoading(true);
      try {
        await checkAuth(controller.signal, SESSION_CHECK_RETRIES);
      } finally {
        if (!controller.signal.aborted && mountedRef.current) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [checkAuth]);

  const login = useCallback(
    (_unused?: string, sessionExpiry?: string | null) => {
      setIsAuthenticated(true);
      const controller = new AbortController();
      void (async () => {
        try {
          await checkAuth(controller.signal, 1);
        } finally {
          if (!controller.signal.aborted && mountedRef.current) {
            setIsLoading(false);
          }
        }
      })();
      if (sessionExpiry !== undefined) {
        setUser((prev) => (prev ? { ...prev, sessionExpiry } : prev));
      }
    },
    [checkAuth],
  );

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
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const refreshSession = useCallback(
    async (durationDays: number): Promise<{ ok: boolean; error?: string }> => {
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

        setUser((prev) =>
          prev ? { ...prev, sessionExpiry: data.sessionExpiry ?? null } : prev,
        );
        return { ok: true };
      } catch {
        return { ok: false, error: "Сетевая ошибка" };
      }
    },
    [isAuthenticated],
  );

  return {
    user,
    token: isAuthenticated ? "__cookie__" : null,
    isLoading,
    isAuthenticated,
    login,
    logout,
    updateUser,
    refreshSession,
  };
}
