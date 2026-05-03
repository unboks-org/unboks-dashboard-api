import { useState, FormEvent } from "react";
import { Package, Lock } from "lucide-react";
import { useAuth } from "@/components/auth/useAuth";
import { getErrorMessage } from "@/lib/error";

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(password, "unboks");
    } catch (err) {
      setError(getErrorMessage(err) || "Invalid password. Please try again.");
    } finally {
      setLoading(false);
    }
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

          {error && (
            <p className="text-[13px] text-[#d93025] bg-[#fce8e6] px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
