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
 *
 * Note: This file was rolled back to the stable J3-N2-14 routing logic
 * as part of a targeted rollback to fix new tenant welcome email issues,
 * while preserving all later mobile redesign and UI work.
 */
const WORKSPACE_HINT_KEY = "wtyj_workspace_hint";

/**
 * J3-BE-46: single structured-log entry point for every decision
 * the tenant-URL routers make. Tagged "[tenant-nav]" so DevTools
 * filtering is one click. Logs an object (not a printf string) so
 * the panel can expand fields like `slug`, `hasTokenForSlug`,
 * `branch`, and `next` independently. Each event name is unique
 * so a grep over the bundle or a DevTools "preserve log" trace
 * shows the full path the user took:
 *
 *   tenant_root.invalid_slug          → URL slug failed shape check
 *   tenant_root.has_token             → existing session, switching
 *   tenant_root.no_token_to_login     → first-time visit, /login bounce
 *   tenant_deeplink.invalid_slug      → /<slug>/<section>/<id> bad slug
 *   tenant_deeplink.no_id             → /<slug>/<section>/ missing id
 *   tenant_deeplink.switch            → deep link + token present
 *   tenant_deeplink.unauth            → deep link without token
 */
function logTenantNav(event: string, data: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log("[tenant-nav]", event, { ...data, ts: Date.now() });
  } catch {
    // console may be unavailable in some headless test contexts.
  }
}

function TenantRootRedirect() {
  const { tenant } = useParams<{ tenant: string }>();
  if (!isValidTenantSlug(tenant)) {
    logTenantNav("tenant_root.invalid_slug", {
      raw_tenant: tenant,
      reason: "fails isValidTenantSlug shape check",
      next: "NotFound",
    });
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
    const previousSlug = getClientSlug();
    if (slug !== previousSlug) {
      setClientSlug(slug);
    }
    logTenantNav("tenant_root.has_token", {
      slug,
      previous_slug: previousSlug,
      switched: slug !== previousSlug,
      next: "/",
    });
    return <Redirect to="/" />;
  }
  // No session yet for this slug. DO NOT touch localStorage — that was
  // the J3-N2-06 bug. Pass the slug to /login via sessionStorage as a
  // hint so the workspace field can pre-fill.
  let hintWritten = false;
  try {
    sessionStorage.setItem(WORKSPACE_HINT_KEY, slug);
    hintWritten = true;
  } catch {
    // sessionStorage unavailable; login just renders with empty workspace.
  }
  logTenantNav("tenant_root.no_token_to_login", {
    slug,
    workspace_hint_set: hintWritten,
    next: "/login",
  });
  return <Redirect to="/login" />;
}

/**
 * Tenant-prefixed bare-section URLs: e.g. /unboks/tasks, /unboks/settings,
 * /unboks/analytics. Same persistence rule as TenantRootRedirect (only
 * touch localStorage when a token already exists for the slug). Sections
 * outside the known set fall through to NotFound so junk URLs like
 * /unboks/garbage still 404 rather than silently redirecting.
 */
const KNOWN_TENANT_SECTIONS = new Set([
  "inbox",          // canonical home -> "/"
  "tasks",
  "settings",
  "analytics",
  "appointments",
  "bookings",
  "escalations",
]);

function TenantSectionRedirect() {
  const { tenant, section } = useParams<{ tenant: string; section: string }>();
  if (!isValidTenantSlug(tenant) || !KNOWN_TENANT_SECTIONS.has(section)) {
    logTenantNav("tenant_section.invalid", {
      raw_tenant: tenant, raw_section: section, next: "NotFound",
    });
    return <NotFound />;
  }
  const slug = tenant as string;
  // "inbox" is rendered at "/"; every other section sits at "/<section>".
  const target = section === "inbox" ? "/" : `/${section}`;
  const hasTokenForSlug = (() => {
    try {
      return !!localStorage.getItem(`wtyj_token_${slug}`);
    } catch {
      return false;
    }
  })();
  if (hasTokenForSlug) {
    const previousSlug = getClientSlug();
    if (slug !== previousSlug) {
      setClientSlug(slug);
    }
    logTenantNav("tenant_section.has_token", {
      slug, section, previous_slug: previousSlug,
      switched: slug !== previousSlug, next: target,
    });
    return <Redirect to={target} />;
  }
  let hintWritten = false;
  try {
    sessionStorage.setItem(WORKSPACE_HINT_KEY, slug);
    hintWritten = true;
  } catch {
    // sessionStorage unavailable; login renders with empty workspace.
  }
  logTenantNav("tenant_section.no_token_to_login", {
    slug, section, workspace_hint_set: hintWritten, next: "/login",
  });
  return <Redirect to="/login" />;
}

function TenantDeepLinkRedirect({ section }: { section: "escalations" | "appointments" }) {
  const { tenant, id } = useParams<{ tenant: string; id: string }>();
  if (!tenant || !id) {
    logTenantNav("tenant_deeplink.no_id", { section, tenant, id, next: "/" });
    return <Redirect to="/" />;
  }
  // J3-N2-10: shape-validate the tenant segment before persisting it.
  // Without this, a junk URL like /favicon.ico/escalations/1 would
  // poison localStorage with "favicon.ico" as the active client and
  // break every subsequent API call. The persistence rule is the same
  // as TenantRootRedirect: only update localStorage when the slug is
  // shape-valid AND the user already has a token for it (i.e. they
  // genuinely signed in to this tenant before).
  if (!isValidTenantSlug(tenant)) {
    logTenantNav("tenant_deeplink.invalid_slug", {
      raw_tenant: tenant, section, next: "NotFound",
    });
    return <NotFound />;
  }
  let switched = false;
  let hasTokenForSlug = false;
  try {
    hasTokenForSlug = !!localStorage.getItem(`wtyj_token_${tenant}`);
    if (hasTokenForSlug && tenant !== getClientSlug()) {
      setClientSlug(tenant);
      switched = true;
    }
  } catch {
    // localStorage unavailable — let the deep link still navigate; the
    // protected route will bounce to /login and the workspace hint
    // path handles the unauthenticated case.
  }
  logTenantNav(
    hasTokenForSlug ? "tenant_deeplink.switch" : "tenant_deeplink.unauth",
    {
      slug: tenant,
      section,
      id,
      has_token_for_slug: hasTokenForSlug,
      switched,
      next: `/${section}/${id}`,
    });
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
      {/* Tenant-prefixed bare-section URL: e.g. /unboks/tasks,
          /unboks/settings, /unboks/analytics. Calvin + JR bookmark
          these. Switches workspace (if signed in) and redirects to the
          equivalent app-relative path. Must come AFTER the deep-link
          routes above (so /:tenant/escalations/:id still wins) but
          BEFORE the bare /:tenant route (which only matches a single
          path segment and would otherwise let /unboks/tasks fall
          through to NotFound). */}
      <Route path="/:tenant/:section">
        <TenantSectionRedirect />
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
      <Route path="/">
        <ProtectedRoute><Inbox /></ProtectedRoute>
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
