import { useState, FormEvent } from "react";
import { useLocation, Redirect } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Lock, Building2 } from "lucide-react";
import { useAuth } from "@/components/auth/useAuth";
import { VALID_CLIENTS, type ValidClient } from "@/lib/api";
import { ApiError } from "@/lib/error";
import unboksLogo from "@assets/unboks-login-logo-optimized_1778556585382.webp";

function getLoginError(err: unknown): string {
  if (err instanceof TypeError) {
    return "Can't reach server. Check your connection or contact support.";
  }
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return "Invalid access key";
    if (err.status >= 500) return "Can't reach server. Check your connection or contact support.";
    return err.message || "Invalid access key";
  }
  return "Can't reach server. Check your connection or contact support.";
}

// R2-35 follow-up: workspace slugs must NOT be exposed on the public login
// page. We accept whatever the operator types, normalise it (trim, lowercase,
// strip non-alphanumerics), then check membership in the private VALID_CLIENTS
// set on submit. The set itself is bundled and could be discovered by a
// determined visitor inspecting the JS — that's a backend concern, but the
// DOM/UI surface no longer leaks any tenant names by default.
function normaliseWorkspace(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveWorkspace(raw: string): ValidClient | null {
  const slug = normaliseWorkspace(raw);
  if (!slug) return null;
  return (VALID_CLIENTS as readonly string[]).includes(slug)
    ? (slug as ValidClient)
    : null;
}

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  // Free-text workspace input. Replaces the previous dropdown that exposed
  // every tenant name. Validation happens at submit time.
  const [workspaceInput, setWorkspaceInput] = useState("");
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
    if (!password.trim() || !workspaceInput.trim()) return;
    const client = resolveWorkspace(workspaceInput);
    if (!client) {
      // Generic copy: do NOT echo the typed value or hint at valid options.
      setLoginError("Workspace not recognized. Check the spelling or contact your admin.");
      return;
    }
    setLoginError(null);
    mutation.mutate({ password, client });
  };

  const canSubmit =
    !mutation.isPending && password.trim().length > 0 && workspaceInput.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#f6f8fc] flex flex-col items-center justify-center px-4 font-sans">
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8eaed] p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {/* R2-35: optimised WebP envelope/channels logo (~5.3 KB).
              Fixed 64x64 box reserves layout space so the card does not
              jump while the image decodes. */}
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
          {/* Workspace input. Free text, no dropdown, no preset list of
              tenant names rendered in the DOM. The operator must know
              their workspace identifier (e.g. provided by their admin)
              and type it in. `autoComplete="off"` and the unusual
              `name` discourage browsers from offering saved values. */}
          <div className="relative">
            <Building2
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5f6368]"
              aria-hidden="true"
            />
            <input
              type="text"
              name="workspace-id"
              value={workspaceInput}
              onChange={(e) => {
                setWorkspaceInput(e.target.value);
                if (loginError) setLoginError(null);
              }}
              placeholder="Enter your workspace"
              aria-label="Workspace"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              required
              className="w-full pl-9 pr-4 py-2.5 border border-[#dadce0] rounded-lg text-[14px] text-[#202124] placeholder:text-[#5f6368] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] transition-colors"
            />
          </div>

          {/* Password input */}
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5f6368]"
              aria-hidden="true"
            />
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (loginError) setLoginError(null);
              }}
              placeholder="Password"
              autoFocus
              required
              autoComplete="current-password"
              className="w-full pl-9 pr-4 py-2.5 border border-[#dadce0] rounded-lg text-[14px] text-[#202124] placeholder:text-[#5f6368] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] transition-colors"
            />
          </div>

          {loginError && (
            <p
              role="alert"
              className="text-[13px] text-[#d93025] bg-[#fce8e6] px-3 py-2 rounded-lg"
            >
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-medium py-2.5 rounded-lg transition-colors"
          >
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
