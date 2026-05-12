import { useState, FormEvent } from "react";
import { useLocation, Redirect } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Lock, ChevronDown } from "lucide-react";
import { useAuth } from "@/components/auth/useAuth";
import { VALID_CLIENTS, type ValidClient } from "@/lib/api";
import { ApiError } from "@/lib/error";
import unboksLogo from "@assets/unboks-login-logo-optimized_1778556585382.webp";

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
  // R2-35: workspace must NOT be preselected. Operator has to intentionally
  // pick their workspace from the dropdown before they can sign in. We model
  // that by holding `null` until a choice is made and disabling submit while
  // it's null.
  const [client, setClient] = useState<ValidClient | null>(null);
  // Dropdown stays closed by default so the page does not greet the user with
  // an open list of every tenant.
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
    if (!password.trim() || !client) return;
    setLoginError(null);
    mutation.mutate({ password, client });
  };

  return (
    <div className="min-h-screen bg-[#f6f8fc] flex flex-col items-center justify-center px-4 font-sans">
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8eaed] p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {/* R2-35: optimised WebP envelope/channels logo (~5.3 KB).
              Fixed 64x64 box reserves layout space so the card does not
              jump while the image decodes. `decoding="async"` and
              `fetchPriority="high"` keep the login render fast. */}
          <img
            src={unboksLogo}
            alt="Unboks"
            width={64}
            height={64}
            decoding="async"
            fetchPriority="high"
            className="w-16 h-16 mb-4 select-none"
            draggable={false}
          />
          <h1 className="text-[22px] font-medium text-[#202124]">Sign in to Unboks</h1>
          <p className="text-[14px] text-[#5f6368] mt-1">Enter your team password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" autoComplete="off">
          {/* Workspace selector. Empty by default — see `client === null`
              branch. Implemented as a <button>, never an <input>, so the
              browser cannot offer autofill suggestions for it. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSelectorOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={selectorOpen}
              className="w-full flex items-center justify-between px-3 py-2.5 border border-[#dadce0] rounded-lg text-[14px] text-[#202124] hover:border-[#1a73e8] transition-colors"
            >
              <span className={client ? "" : "text-[#5f6368]"}>
                {client ? CLIENT_LABELS[client] : "Select your workspace"}
              </span>
              <ChevronDown className="w-4 h-4 text-[#5f6368]" />
            </button>
            {selectorOpen && (
              <div
                role="listbox"
                className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-10 overflow-hidden"
              >
                {VALID_CLIENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="option"
                    aria-selected={client === c}
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
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              required
              autoComplete="current-password"
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
            disabled={mutation.isPending || !password.trim() || !client}
            className="w-full bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-medium py-2.5 rounded-lg transition-colors"
          >
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
