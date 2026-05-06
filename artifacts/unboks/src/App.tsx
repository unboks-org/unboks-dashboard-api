import { Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
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

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/bookings">
        <ProtectedRoute><Bookings /></ProtectedRoute>
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
