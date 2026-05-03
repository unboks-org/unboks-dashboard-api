import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { FeatureTogglesProvider } from "@/lib/feature-toggles";
import NotFound from "@/pages/not-found";
import Inbox from "@/pages/Inbox";
import Login from "@/pages/Login";
import Bookings from "@/pages/Bookings";
import Settings from "@/pages/Settings";
import Analytics from "@/pages/Analytics";

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
        <ProtectedRoute><Settings /></ProtectedRoute>
      </Route>
      <Route path="/analytics">
        <ProtectedRoute><Analytics /></ProtectedRoute>
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
  );
}

export default App;
