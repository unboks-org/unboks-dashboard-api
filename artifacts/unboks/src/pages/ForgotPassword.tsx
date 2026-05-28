import { FormEvent, useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Building2, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { isValidTenantSlug, requestPasswordReset } from "@/lib/api";
import { ApiError } from "@/lib/error";
import unboksLogo from "@assets/unboks-login-logo-optimized_1778556585382.webp";

const GENERIC = "If this email exists, we sent password reset instructions.";

function workspaceFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("workspace") || "";
  } catch {
    return "";
  }
}

export default function ForgotPassword() {
  const [workspace, setWorkspace] = useState(workspaceFromUrl);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => requestPasswordReset(workspace.trim(), email.trim()),
    onSuccess: (res) => {
      setError("");
      setMessage(res.message || GENERIC);
    },
    onError: (err) => {
      setMessage("");
      setError(
        err instanceof ApiError && err.status === 0
          ? "Can't reach server. Check your connection or contact support."
          : "Could not request a reset right now. Try again later.",
      );
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!isValidTenantSlug(workspace.trim())) {
      setError("Enter your workspace first.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your email address.");
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
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground">Reset your password</h1>
          <p className="text-[14px] text-muted-foreground mt-1.5 text-center">Enter your workspace and email address.</p>
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
            <span className="text-[13px] font-medium text-foreground ml-1">Email</span>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 h-11 border border-input rounded-xl text-[14px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-background"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          </label>
          {message && <p className="text-[13px] text-[#137333] bg-[#e6f4ea] px-4 py-3 rounded-xl font-medium border border-[#ceead6]">{message}</p>}
          {error && <p role="alert" className="text-[13px] text-destructive bg-destructive/10 px-4 py-3 rounded-xl font-medium border border-destructive/20">{error}</p>}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-[14px] font-semibold h-11 rounded-xl transition-colors mt-2 shadow-sm"
          >
            {mutation.isPending ? "Sending..." : "Send reset link"}
          </button>
          <Link href="/login" className="text-center text-[13px] font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </form>
      </motion.div>
    </div>
  );
}

