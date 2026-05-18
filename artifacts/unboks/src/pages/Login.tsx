import { useState, FormEvent } from "react";
import { useLocation, Redirect } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Lock, Building2 } from "lucide-react";
import { useAuth } from "@/components/auth/useAuth";
import { isValidTenantSlug, type ValidClient } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { motion } from "framer-motion";
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

// ---------------------------------------------------------------------------
// Workspace hint reading for welcome email flow
// ---------------------------------------------------------------------------
//
// When Calvin creates a tenant in ICP and sends a welcome email, the link
// is https://dashboard.unboks.org/{slug}.
//
// TenantRootRedirect catches it, stores the slug in sessionStorage as a hint,
// and sends the user to /login.
//
// This function reads that hint (plus supports the older ?workspace= query param).
// We remove the hint after reading so it doesn't stick around.
const WORKSPACE_HINT_KEY = "wtyj_workspace_hint";

function readWorkspaceHint(): string {
  // 1. ?workspace= query param (some older welcome email variants)
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("workspace");
    if (fromUrl && isValidTenantSlug(fromUrl)) {
      return fromUrl;
    }
  } catch {}

  // 2. sessionStorage hint set by TenantRootRedirect when landing on /<slug>
  try {
    const hint = sessionStorage.getItem(WORKSPACE_HINT_KEY);
    if (hint) {
      sessionStorage.removeItem(WORKSPACE_HINT_KEY);
      if (isValidTenantSlug(hint)) return hint;
    }
  } catch {}

  return "";
}

function resolveWorkspace(raw: string): ValidClient | null {
  const slug = raw.trim();
  return isValidTenantSlug(slug) ? slug : null;
}

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [workspaceInput, setWorkspaceInput] = useState(readWorkspaceHint);
  const [loginError, setLoginError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ password, client }: { password: string; client: ValidClient }) =>
      login(password, client),
    onError: (err: unknown) => setLoginError(getLoginError(err)),
  });

  if (isAuthenticated) return <Redirect to="/" />;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim() || !workspaceInput.trim()) return;

    const client = resolveWorkspace(workspaceInput);
    if (!client) {
      setLoginError("Workspace not recognized. Check the spelling or contact your admin.");
      return;
    }

    setLoginError(null);
    mutation.mutate({ password, client });
  };

  const canSubmit =
    !mutation.isPending && password.trim().length > 0 && workspaceInput.trim().length > 0;

  return (
    <div className="min-h-[100dvh] bg-background sm:bg-muted flex flex-col items-center sm:justify-center font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="bg-card sm:rounded-2xl sm:shadow-sm sm:border border-border p-6 sm:p-10 w-full max-w-[400px] flex-1 sm:flex-none flex flex-col justify-center"
      >
        <div className="flex flex-col items-center mb-10">
          <img
            src={unboksLogo}
            alt="Unboks"
            width={64}
            height={64}
            decoding="async"
            fetchPriority="high"
            className="w-16 h-16 mb-6 select-none shadow-sm rounded-2xl"
            draggable={false}
          />
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground">Sign in to Unboks</h1>
          <p className="text-[14px] text-muted-foreground mt-1.5">Enter your team password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5" autoComplete="off">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground ml-1">Workspace</label>
            <div className="relative">
              <Building2
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
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
                className="w-full pl-10 pr-4 h-11 border border-input rounded-xl text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all bg-background"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground ml-1">Password</label>
            <div className="relative">
              <Lock
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
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
                className="w-full pl-10 pr-4 h-11 border border-input rounded-xl text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all bg-background"
              />
            </div>
          </div>

          {loginError && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              role="alert"
              className="text-[13px] text-destructive bg-destructive/10 px-4 py-3 rounded-xl font-medium border border-destructive/20"
            >
              {loginError}
            </motion.p>
          )}

          <motion.button
            type="submit"
            disabled={!canSubmit}
            whileTap={canSubmit ? { scale: 0.97, opacity: 0.9 } : undefined}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground text-[14px] font-semibold h-11 rounded-xl transition-colors mt-2 shadow-sm"
          >
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
