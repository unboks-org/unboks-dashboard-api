import { createContext } from "react";

export interface AuthState {
  isAuthenticated: boolean;
  clientSlug: string;
  login: (password: string, clientSlug?: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);
