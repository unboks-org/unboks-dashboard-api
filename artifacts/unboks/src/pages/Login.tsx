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

// J3-N2-10: workspace slugs are fully dynamic. There is no hardcoded
// list and no client-side membership check. We accept any URL-safe slug
// shape (see isValidTenantSlug in lib/api.ts) and let the backend be
// the sole authority on whether the tenant actually exists. An unknown
// slug fails authentication with the same generic "Invalid access key"
// message, so no information about valid tenants leaks from the form.
//
// Normalisation is deliberately minimal — only whitespace is stripped.
// Case is preserved verbatim because the backend treats tenant slugs as
// case-sensitive; previously we lowercased the input, which silently
// broke any ICP tenant whose slug contained an uppercase letter.
const WORKSPACE_HINT_KEY = "wtyj_workspace_hint";

// J3-N2-11: welcome emails ship the slug as a query parameter on the
// root URL (https://dashboard.unboks.org/?workspace=<slug>) instead of
// a /<slug> path. The root URL is the one users' browsers cache
// reliably, which avoids the stale-bundle "Load failed" path that hit
// brand-new path segments on mobile. The Login component reads the
// slug from either source, query param OR sessionStorage hint, so
// both flows pre-fill the workspace field automatically.
function readWorkspaceHint(): string {
  // Priority 1: ?workspace=<slug> on the current URL (welcome-email
  // entry point). Validated against the same ICP slug shape used
  // elsewhere so a tampered URL can't pre-fill garbage.
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("workspace");
    if (fromUrl && isValidTenantSlug(fromUrl)) {
      // eslint-disable-next-line no-console
      console.log("[tenant-nav]", "login.hint_from_url", {
        slug: fromUrl, source: "?workspace=", ts: Date.now(),
      });
      return fromUrl;
    }
  } catch {
    // window.location may be unavailable in non-browser contexts; fall
    // through to the sessionStorage hint.
  }
  // Priority 2: sessionStorage hint stashed by TenantRootRedirect (the
  // /<slug> bare-path flow from J3-N2-07).
  try {
    const hint = sessionStorage.getItem(WORKSPACE_HINT_KEY);
    if (hint) sessionStorage.removeItem(WORKSPACE_HINT_KEY);
    if (hint && isValidTenantSlug(hint)) {
      // eslint-disable-next-line no-console
      console.log("[tenant-nav]", "login.hint_from_session", {
        slug: hint, source: "sessionStorage", ts: Date.now(),
      });
    } else if (!hint) {
      // eslint-disable-next-line no-console
      console.log("[tenant-nav]", "login.no_hint", {
        reason: "no ?workspace= and no sessionStorage hint",
        ts: Date.now(),
      });
    }
    return hint || "";
  } catch {
    return "";
  }
}

function resolveWorkspace(raw: string): ValidClient | null {
  const slug = raw.trim();
  return isValidTenantSlug(slug) ? slug : null;
}

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  // Free-text workspace input. Replaces the previous dropdown that exposed
  // every tenant name. Validation happens at submit time.
  const [workspaceInput, setWorkspaceInput] = useState(readWorkspaceHint);
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
    mutation.mutate({ password: password.trim(), client });
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
            className="w-16 h-16 mb-6 select-none shadow-sm rounded-2xl"
            draggable={false}
          />
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground">Sign in to Unboks</h1>
          <p className="text-[14px] text-muted-foreground mt-1.5">Enter your team password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5" autoComplete="off">
          {/* Workspace input. Free text, no dropdown, no preset list of
              tenant names rendered in the DOM. The operator must know
              their workspace identifier (e.g. provided by their admin)
              and type it in. `autoComplete="off"` and the unusual
              `name` discourage browsers from offering saved values. */}
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

          {/* Password input */}
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
