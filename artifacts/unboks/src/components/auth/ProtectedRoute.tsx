import { useContext } from "react";
import { Redirect } from "wouter";
import { AuthContext } from "./AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const auth = useContext(AuthContext);
  if (!auth?.isAuthenticated) return <Redirect to="/login" />;
  return <>{children}</>;
}
