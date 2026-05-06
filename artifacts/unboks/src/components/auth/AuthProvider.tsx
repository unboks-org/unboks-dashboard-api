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
      navigate("/");
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
