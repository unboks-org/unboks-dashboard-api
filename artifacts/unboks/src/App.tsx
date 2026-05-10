import { Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useParams } from "wouter";
import { setClientSlug, getClientSlug } from "@/lib/tenant";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SettingsErrorBoundary } from "@/components/SettingsErrorBoundary";
import { FeatureTogglesProvider } from "@/lib/feature-toggles";
// QAPanel: hidden internal dev panel for manual flow testing. Renders
// nothing unless `?qa=1` or localStorage["unboks_qa_panel"]==="1".
// Remove this import + the <QAPanel /> mount below to take it out.
import { QAPanel } from "@/components/dev/QAPanel";
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
              this.setState({ error: null });
              window.location.href = "/";
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
 * Handles backend-generated path-based deep links of the form:
 *   https://dashboard.unboks.org/<tenant>/escalations/<id>
 *   https://dashboard.unboks.org/<tenant>/appointments/<id>
 *
 * When the production Vite build has BASE_PATH="/" (the default for the
 * deployment runner), Wouter's base is "" and the full pathname is visible
 * to the router. The specific short routes (/escalations/:id, etc.) are
 * registered WITHOUT the tenant prefix, so the tenant-prefixed URL falls
 * through to a 404.
 *
 * This component:
 *   1. Reads the :tenant and :id params via useParams (within a Route match).
 *   2. Synchronously writes the tenant slug to localStorage so all subsequent
 *      API calls target the right workspace — identical to the login flow.
 *   3. Issues a Wouter Redirect to the canonical inner path (/escalations/:id
 *      or /appointments/:id) which IS registered, so the full auth-gate →
 *      deep-link → detail-panel flow runs exactly as for in-app navigation.
 *
 * Login redirect round-trip:
 *   - Unauthenticated user hits /:tenant/escalations/25.
 *   - TenantDeepLinkRedirect sets slug, then redirects to /escalations/25.
 *   - ProtectedRoute on /escalations/:id saves "/escalations/25" and sends
 *     user to /login.
 *   - After login AuthProvider navigates to "/escalations/25" directly. ✓
 *
 * Placement: these two routes must come AFTER all the short specific routes
 * inside <Switch> so they don't shadow /escalations/:id (which would match
 * with tenant="escalations" otherwise).
 */
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
                <QAPanel />
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
