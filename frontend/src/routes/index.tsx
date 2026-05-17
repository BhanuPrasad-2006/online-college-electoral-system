import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, GraduationCap, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { voterLoginStep1, candidateLoginStep1, saveOtpSession } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/")({ component: Login });

function Login() {
  const nav = useNavigate();
  const [tab, setTab] = useState<"voter" | "candidate">("voter");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (tab === "voter") {
        const res = await voterLoginStep1(email, password);
        saveOtpSession(res.otp_session_token, email);
        toast.success(res.hint);
        nav({ to: "/voter/otp-verify" });
      } else {
        const mobileNum = mobile.replace(/\s/g, "");
        const res = await candidateLoginStep1(email, mobileNum, password);
        saveOtpSession(res.otp_session_token, email, mobileNum);
        toast.success(res.hint);
        nav({ to: "/candidate/otp-verify" });
      }
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please try again.");
      toast.error(err.message || "Login failed.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left side */}
      <div className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-[#1F3A6E] via-[#2A4985] to-[#6C63FF] items-center justify-center p-12 text-white">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#6C63FF] rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-md">
          <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-6">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-bold leading-tight">CollegeVote</h1>
          <p className="text-lg text-white/80 mt-3">Secure AI-Based College Election Management</p>
          <p className="text-sm text-white/60 mt-6 leading-relaxed">
            Cast your vote with confidence. End-to-end encrypted, AI-monitored, and fully anonymous.
          </p>
          <div className="mt-10 space-y-3">
            <Feature icon={<ShieldCheck className="h-5 w-5" />} text="Multi-factor secure authentication" />
            <Feature icon={<Sparkles className="h-5 w-5" />} text="AI-powered candidate matching" />
            <Feature icon={<GraduationCap className="h-5 w-5" />} text="Built for student council elections" />
          </div>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-lg bg-[#1F3A6E] flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-semibold text-lg">CollegeVote</span>
          </div>

          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="text-sm text-muted-foreground mt-1">Sign in to continue to your portal.</p>

          <div className="mt-6 grid grid-cols-2 bg-muted rounded-xl p-1">
            <button
              onClick={() => setTab("voter")}
              className={`py-2.5 text-sm font-medium rounded-lg transition-colors ${tab === "voter" ? "bg-card text-[#1F3A6E] shadow-sm" : "text-muted-foreground"}`}
            >
              Login as Voter
            </button>
            <button
              onClick={() => setTab("candidate")}
              className={`py-2.5 text-sm font-medium rounded-lg transition-colors ${tab === "candidate" ? "bg-card text-[#1F3A6E] shadow-sm" : "text-muted-foreground"}`}
            >
              Login as Candidate
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">College Email</label>
              <Input type="email" required placeholder="yourname@college.edu.in" className="mt-1.5 h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {tab === "candidate" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
                <div className="mt-1.5 flex">
                  <span className="inline-flex items-center px-3 border border-r-0 border-border bg-muted rounded-l-md text-sm">+91</span>
                  <Input type="tel" required placeholder="98765 43210" className="rounded-l-none h-11" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Password</label>
                {tab === "voter" && <button type="button" className="text-xs text-[#6C63FF] font-medium">Forgot Password?</button>}
              </div>
              <div className="mt-1.5 relative">
                <Input type={show ? "text" : "password"} required placeholder="••••••••" className="pr-10 h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11 bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white">
              {loading ? "Signing in..." : "Login"}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground mt-8">
            Protected by multi-factor authentication & AI fraud detection
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-white/85">
      <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center">{icon}</div>
      <span className="text-sm">{text}</span>
    </div>
  );
}
