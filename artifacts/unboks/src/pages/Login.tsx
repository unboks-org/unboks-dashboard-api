import { useEffect, useState, FormEvent } from "react";
import { useLocation, Redirect } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Package, Lock, ChevronDown } from "lucide-react";
import { useAuth } from "@/components/auth/useAuth";
import { VALID_CLIENTS, type ValidClient } from "@/lib/api";
import { ApiError } from "@/lib/error";

const CLIENT_LABELS: Record<ValidClient, string> = {
  unboks: "Unboks",
  bluemarlin: "Blue Marlin",
  adamus: "Adamus",
  consultadespertares: "Consulta Despertares",
};

function getLoginError(err: unknown): string {
  if (err instanceof TypeError) {
    return "Can't reach server — check your connection or contact support";
  }
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return "Invalid access key";
    if (err.status >= 500) return "Can't reach server — check your connection or contact support";
    return err.message || "Invalid access key";
  }
  return "Can't reach server — check your connection or contact support";
}

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [client, setClient] = useState<ValidClient>("unboks");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // ⚠️ useMutation must be called BEFORE any early return to obey Rules of Hooks
  const mutation = useMutation({
    mutationFn: ({ password, client }: { password: string; client: ValidClient }) =>
      login(password, client),
    onError: (err: unknown) => setLoginError(getLoginError(err)),
  });

  // If already authenticated, go straight to inbox
  if (isAuthenticated) return <Redirect to="/" />;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoginError(null);
    mutation.mutate({ password, client });
  };

  return (
    <div className="min-h-screen bg-[#f6f8fc] flex flex-col items-center justify-center px-4 font-sans">
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8eaed] p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-10 h-10 bg-[#1a73e8] rounded-xl flex items-center justify-center mb-4">
            <Package className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-[22px] font-medium text-[#202124]">Sign in to Unboks</h1>
          <p className="text-[14px] text-[#5f6368] mt-1">Enter your team password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Workspace selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSelectorOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2.5 border border-[#dadce0] rounded-lg text-[14px] text-[#202124] hover:border-[#1a73e8] transition-colors"
            >
              <span>{CLIENT_LABELS[client]}</span>
              <ChevronDown className="w-4 h-4 text-[#5f6368]" />
            </button>
            {selectorOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-10 overflow-hidden">
                {VALID_CLIENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setClient(c); setSelectorOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-[14px] text-[#202124] hover:bg-[#f6f8fc] transition-colors"
                  >
                    {CLIENT_LABELS[c]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Password input */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5f6368]" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              required
              className="w-full pl-9 pr-4 py-2.5 border border-[#dadce0] rounded-lg text-[14px] text-[#202124] placeholder:text-[#5f6368] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] transition-colors"
            />
          </div>

          {loginError && (
            <p className="text-[13px] text-[#d93025] bg-[#fce8e6] px-3 py-2 rounded-lg">
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending || !password.trim()}
            className="w-full bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-medium py-2.5 rounded-lg transition-colors"
          >
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
