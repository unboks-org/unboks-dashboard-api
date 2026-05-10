import { useState, useCallback, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { AuthContext } from "./AuthContext";
import {
  getToken,
  setToken,
  setClientSlug,
  getClientSlug,
  clearAuth,
} from "@/lib/tenant";
import { apiLogin, registerUnauthorizedHandler } from "@/lib/api";
import { LOGIN_REDIRECT_STORAGE_KEY } from "@/lib/deep-link";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [clientSlug, setClientSlugState] = useState<string>(getClientSlug);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => Boolean(getToken()),
  );

  // Register global 401 handler
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      toast.error("Session expired. Please sign in again.");
      navigate("/login");
    });
  }, [navigate]);

  const login = useCallback(
    async (password: string, slug = "unboks") => {
      setClientSlug(slug);
      setClientSlugState(slug);
      const { token } = await apiLogin(password);
      setToken(token, slug);
      setIsAuthenticated(true);
      // Honour the path the user was trying to reach before the auth
      // bounce (set by `ProtectedRoute`). This is what makes deep links
      // from alert emails survive an unauthenticated entry point — the
      // user signs in once and lands on the exact escalation or
      // appointment that was linked, instead of the inbox root.
      let dest = "/";
      try {
        const stored = sessionStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY);
        if (stored && !stored.startsWith("/login")) dest = stored;
        sessionStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
      } catch {
        // sessionStorage may be unavailable; fall back to "/".
      }
      navigate(dest);
    },
    [navigate],
  );

  const logout = useCallback(() => {
    clearAuth();
    setIsAuthenticated(false);
    navigate("/login");
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, clientSlug, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
