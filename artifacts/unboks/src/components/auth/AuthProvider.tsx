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

  // Register global 401 handler. Mirrors `ProtectedRoute`: capture the
  // current router-relative path so the post-login bounce returns the
  // operator to the page they were on (Appointments / Escalations /
  // Settings) instead of dumping them on Inbox after a session-expired
  // refresh.
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
      } catch {
        // sessionStorage may be unavailable; missed redirect just means
        // the operator lands on "/" after sign-in.
      }
      setIsAuthenticated(false);
      toast.error("Session expired. Please sign in again.");
      navigate("/login");
    });
  }, [navigate]);

  const login = useCallback(
    async (password: string, slug = "unboks") => {
      // J3-N2-10: do NOT persist the slug until the backend confirms
      // credentials. apiLogin accepts an explicit slug so the request
      // targets the intended tenant without mutating localStorage. If
      // the call throws (wrong password, unknown tenant, network), the
      // persisted client + token pair is left untouched and the user's
      // previous working session (if any) is preserved.
      const { token } = await apiLogin(password, slug);
      setClientSlug(slug);
      setClientSlugState(slug);
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
