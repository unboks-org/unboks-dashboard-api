import { useContext } from "react";
import { Redirect } from "wouter";
import { AuthContext } from "./AuthContext";
import { LOGIN_REDIRECT_STORAGE_KEY } from "@/lib/deep-link";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Auth gate. When the user isn't signed in we capture the path they
 * were trying to reach (router-relative — i.e. the wouter base / artifact
 * prefix is stripped) into sessionStorage, then redirect to /login.
 * `AuthProvider.login()` reads this key and bounces the user to that
 * path after a successful sign-in, so deep links from alert emails
 * survive the login round-trip.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const auth = useContext(AuthContext);
  if (!auth?.isAuthenticated) {
    try {
      // Strip the wouter base (`import.meta.env.BASE_URL`) so the stored
      // path is something we can hand back to wouter's `navigate(...)`
      // without doubling the artifact prefix.
      const here = window.location.pathname + window.location.search;
      const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const inner =
        base && here.startsWith(base) ? here.slice(base.length) || "/" : here;
      // Never round-trip back to /login itself — that would be a loop.
      if (!inner.startsWith("/login")) {
        sessionStorage.setItem(LOGIN_REDIRECT_STORAGE_KEY, inner);
      }
    } catch {
      // sessionStorage can throw in private modes / sandboxed iframes;
      // a missed redirect just means the user lands on `/` after login,
      // which is the existing behaviour.
    }
    return <Redirect to="/login" />;
  }
  return <>{children}</>;
}
