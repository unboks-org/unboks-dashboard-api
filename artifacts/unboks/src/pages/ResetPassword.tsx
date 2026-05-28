import { FormEvent, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Building2, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { isValidTenantSlug, resetPassword } from "@/lib/api";
import { ApiError } from "@/lib/error";
import unboksLogo from "@assets/unboks-login-logo-optimized_1778556585382.webp";

function params() {
  try {
    const p = new URLSearchParams(window.location.search);
    return { workspace: p.get("workspace") || "", token: p.get("token") || "" };
  } catch {
    return { workspace: "", token: "" };
  }
}

export default function ResetPassword() {
  const initial = useMemo(params, []);
  const [workspace, setWorkspace] = useState(initial.workspace);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const mutation = useMutation({
    mutationFn: () => resetPassword(workspace.trim(), initial.token, password, confirm),
    onSuccess: (res) => {
      setError("");
      setSuccess(res.message || "Password reset. You can sign in with your new password.");
    },
    onError: (err) => {
      setSuccess("");
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "Reset link is invalid or expired.",
      );
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!initial.token) {
      setError("Reset link is invalid or expired.");
      return;
    }
    if (!isValidTenantSlug(workspace.trim())) {
      setError("Enter your workspace first.");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="min-h-[100dvh] bg-background sm:bg-muted flex flex-col items-center sm:justify-center font-sans">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="bg-card sm:rounded-2xl sm:shadow-sm sm:border border-border p-6 sm:p-10 w-full max-w-[420px] flex-1 sm:flex-none flex flex-col justify-center"
      >
        <div className="flex flex-col items-center mb-8">
          <img src={unboksLogo} alt="Unboks" width={64} height={64} className="w-16 h-16 mb-6 rounded-2xl shadow-sm" />
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground">Choose a new password</h1>
          <p className="text-[14px] text-muted-foreground mt-1.5 text-center">Use at least 12 characters with letters and numbers.</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <label className="space-y-1.5">
            <span className="text-[13px] font-medium text-foreground ml-1">Workspace</span>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                className="w-full pl-10 pr-4 h-11 border border-input rounded-xl text-[14px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-background"
                placeholder="your-workspace"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-[13px] font-medium text-foreground ml-1">New password</span>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 h-11 border border-input rounded-xl text-[14px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-background"
                autoComplete="new-password"
              />
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-[13px] font-medium text-foreground ml-1">Confirm password</span>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full pl-10 pr-4 h-11 border border-input rounded-xl text-[14px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-background"
                autoComplete="new-password"
              />
            </div>
          </label>
          {success && <p className="text-[13px] text-[#137333] bg-[#e6f4ea] px-4 py-3 rounded-xl font-medium border border-[#ceead6]">{success}</p>}
          {error && <p role="alert" className="text-[13px] text-destructive bg-destructive/10 px-4 py-3 rounded-xl font-medium border border-destructive/20">{error}</p>}
          <button
            type="submit"
            disabled={mutation.isPending || Boolean(success)}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-[14px] font-semibold h-11 rounded-xl transition-colors mt-2 shadow-sm"
          >
            {mutation.isPending ? "Saving..." : "Reset password"}
          </button>
          <Link href={`/login?workspace=${encodeURIComponent(workspace)}`} className="text-center text-[13px] font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </form>
      </motion.div>
    </div>
  );
}

