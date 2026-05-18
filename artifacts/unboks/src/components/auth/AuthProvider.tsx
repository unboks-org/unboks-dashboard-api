import { useState, useCallback, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { AuthContext } from "./AuthContext";
import {
  getCurrentSlug,
  setCurrentSlug,
  getToken,
  setToken,
  clearToken,
} from "@/lib/tenant";
import { apiLogin, registerUnauthorizedHandler } from "@/lib/api";
import { LOGIN_REDIRECT_STORAGE_KEY } from "@/lib/deep-link";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [clientSlug, setClientSlugState] = useState<string>(getCurrentSlug);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => Boolean(getToken()),
  );

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      try {
        const here = window.location.pathname + window.location.search;
        const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
        const inner =
          base && here.startsWith(base) ? here.slice(base.length) || "/" : here;
        if (!inner.startsWith("/login")) {
          sessionStorage.setItem(LOGIN_REDIRECT_STORAGE_KEY, inner);
        }
      } catch {}
      setIsAuthenticated(false);
      toast.error("Session expired. Please sign in again.");
      navigate("/login");
    });
  }, [navigate]);

  const login = useCallback(
    async (password: string, slug?: string) => {
      const targetSlug = slug || getCurrentSlug();

      const { token } = await apiLogin(password, targetSlug);

      setCurrentSlug(targetSlug);
      setClientSlugState(targetSlug);
      setToken(token, targetSlug);
      setIsAuthenticated(true);

      let dest = "/";
      try {
        const stored = sessionStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY);
        if (stored && !stored.startsWith("/login")) dest = stored;
        sessionStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
      } catch {}

      navigate(dest);
    },
    [navigate],
  );

  const logout = useCallback(() => {
    clearToken();
    setIsAuthenticated(false);
    navigate("/login");
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, clientSlug, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
