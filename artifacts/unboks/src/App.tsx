import { Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useParams } from "wouter";
import { setClientSlug, getClientSlug } from "@/lib/tenant";
import { isValidTenantSlug } from "@/lib/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SettingsErrorBoundary } from "@/components/SettingsErrorBoundary";
import { FeatureTogglesProvider } from "@/lib/feature-toggles";
import NotFound from "@/pages/not-found";
import Inbox from "@/pages/Inbox";
import Login from "@/pages/Login";
import Bookings from "@/pages/Bookings";
import Settings from "@/pages/Settings";
import Analytics from "@/pages/Analytics";
import Tasks from "@/pages/Tasks";

// Top-level error boundary — prevents white screen on any render crash
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          <h2 style={{ color: "#d93025", marginBottom: 8 }}>Something went wrong</h2>
          <pre style={{ background: "#f6f8fc", padding: 16, borderRadius: 8, fontSize: 13, overflowX: "auto", whiteSpace: "pre-wrap" }}>
            {(error as Error).message}
            {"\n\n"}
            {(error as Error).stack}
          </pre>
          <button
            onClick={() => {
              // Reload the current URL so the operator stays on the page they
              // were on (Appointments / Escalations / Settings). Forcing
              // `href = "/"` would dump every crash recovery back to Inbox,
              // which is exactly the "after reset/refresh I lose my page"
              // bug operators reported.
              this.setState({ error: null });
              window.location.reload();
            }}
            style={{ marginTop: 16, padding: "8px 16px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          (error as { status: number }).status === 401
        )
          return false;
        return failureCount < 2;
      },
    },
  },
});

/**
 * Handles bare tenant URLs of the form:
 *   https://dashboard.unboks.org/<slug>
 *
 * J3-N2-07: accepts ANY ICP-shaped slug — no hardcoded whitelist. A tenant
 * created via the Nr 3 wizard becomes reachable from this URL on the next
 * page load. Junk like /favicon.ico still 404s because it fails the shape
 * check (isValidTenantSlug).
 *
 * Persistence rule (the lesson from J3-N2-06): a tenant slug is written
 * to localStorage ONLY after a successful authenticated session for that
 * tenant exists. If the URL slug matches an existing token, we treat it
 * as a workspace switch (persist + go to inbox). If there is no token
 * for the URL slug yet, we send the user to /login with the slug stored
 * as a sessionStorage HINT so the workspace field can pre-fill; the
 * persistent wtyj_client + wtyj_token_<slug> pair is only written by
 * AuthProvider.login after the backend confirms credentials. This
 * prevents the previous bug where visiting an unknown slug bricked
 * every subsequent dashboard.unboks.org/ visit.
 */
const WORKSPACE_HINT_KEY = "wtyj_workspace_hint";

function TenantRootRedirect() {
  const { tenant } = useParams<{ tenant: string }>();
  if (!isValidTenantSlug(tenant)) {
    return <NotFound />;
  }
  const slug = tenant as string;
  const hasTokenForSlug = (() => {
    try {
      return !!localStorage.getItem(`wtyj_token_${slug}`);
    } catch {
      return false;
    }
  })();
  if (hasTokenForSlug) {
    // Existing session for this slug — treat as workspace switch.
    if (slug !== getClientSlug()) {
      setClientSlug(slug);
    }
    return <Redirect to="/" />;
  }
  // No session yet for this slug. DO NOT touch localStorage — that was
  // the J3-N2-06 bug. Pass the slug to /login via sessionStorage as a
  // hint so the workspace field can pre-fill.
  try {
    sessionStorage.setItem(WORKSPACE_HINT_KEY, slug);
  } catch {
    // sessionStorage unavailable; login just renders with empty workspace.
  }
  return <Redirect to="/login" />;
}

function TenantDeepLinkRedirect({ section }: { section: "escalations" | "appointments" }) {
  const { tenant, id } = useParams<{ tenant: string; id: string }>();
  // Synchronously update the client slug before the redirect commits.
  if (tenant && tenant !== getClientSlug()) {
    setClientSlug(tenant);
  }
  if (!tenant || !id) return <Redirect to="/" />;
  return <Redirect to={`/${section}/${encodeURIComponent(id)}`} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/bookings">
        <ProtectedRoute><Bookings /></ProtectedRoute>
      </Route>
      {/* Renamed surface: /appointments is the new canonical path; the
          /bookings route stays so existing bookmarks keep working. */}
      <Route path="/appointments">
        <ProtectedRoute><Bookings /></ProtectedRoute>
      </Route>
      {/* Deep link from alert emails / WhatsApp: opens the
          Appointments page and auto-highlights the matching row.
          The id is decoded inside Bookings via `useDeepLink`. */}
      <Route path="/appointments/:id">
        <ProtectedRoute><Bookings /></ProtectedRoute>
      </Route>
      {/* Deep links into Escalations. Both the bare /escalations
          surface (used for `?view=escalations` style links) and the
          path-with-id form are protected and rendered through Inbox,
          which owns the Escalations list and detail panel. */}
      <Route path="/escalations">
        <ProtectedRoute><Inbox /></ProtectedRoute>
      </Route>
      <Route path="/escalations/:id">
        <ProtectedRoute><Inbox /></ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <SettingsErrorBoundary>
            <Settings />
          </SettingsErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route path="/analytics">
        <ProtectedRoute><Analytics /></ProtectedRoute>
      </Route>
      <Route path="/tasks">
        <ProtectedRoute><Tasks /></ProtectedRoute>
      </Route>
      <Route path="/Tasks">
        <Redirect to="/tasks" />
      </Route>
      <Route path="/">
        <ProtectedRoute><Inbox /></ProtectedRoute>
      </Route>
      {/* Tenant-prefixed deep links from backend alert emails.
          These MUST come after all the specific short routes above so that
          e.g. /escalations/25 is caught by /escalations/:id (above) and
          not by /:tenant/escalations/:id with tenant="escalations". */}
      <Route path="/:tenant/escalations/:id">
        <TenantDeepLinkRedirect section="escalations" />
      </Route>
      <Route path="/:tenant/appointments/:id">
        <TenantDeepLinkRedirect section="appointments" />
      </Route>
      {/* Bare tenant URL: e.g. dashboard.unboks.org/<slug> resolves
          via TenantRootRedirect. Any ICP-shaped slug is accepted (no
          hardcoded whitelist); junk shapes still 404 via the regex check
          in isValidTenantSlug. New tenants from the ICP wizard work
          here immediately without a frontend redeploy. Must come after
          the more specific /:tenant/escalations/:id and
          /:tenant/appointments/:id routes. */}
      <Route path="/:tenant">
        <TenantRootRedirect />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <FeatureTogglesProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AuthProvider>
                <Router />
              </AuthProvider>
            </WouterRouter>
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </FeatureTogglesProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
