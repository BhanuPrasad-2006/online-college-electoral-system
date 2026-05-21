import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Eye, EyeOff, GraduationCap, ShieldCheck, Sparkles, AlertCircle, ArrowLeft, Mail, Key } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { 
  voterLoginStep1, 
  candidateLoginStep1, 
  saveOtpSession, 
  requestForgotPassword, 
  confirmForgotPassword,
  candidateCheckStatus,
  candidateInitiateNew,
  saveAuth
} from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/")({ component: Login });

function Login() {
  const nav = useNavigate();
  const { role, isAuthed, authReady } = useAuth();
  
  useEffect(() => {
    if (authReady && isAuthed && role) {
      const roleDashboard =
        role === "voter"
          ? "/voter/dashboard"
          : role === "candidate"
            ? "/candidate/dashboard"
            : "/admin/dashboard";
      nav({ to: roleDashboard });
    }
  }, [authReady, isAuthed, role, nav]);
  
  // Login States
  const [tab, setTab] = useState<"voter" | "candidate">("voter");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [rejectionRemarks, setRejectionRemarks] = useState("");

  // Candidate Sub-Steps
  const [candidateStep, setCandidateStep] = useState<"email_mobile" | "password" | "select_year">("email_mobile");
  const [candidateYear, setCandidateYear] = useState<string>("");

  useEffect(() => {
    setCandidateStep("email_mobile");
    setError("");
    setRejectionRemarks("");
    setCandidateYear("");
    setPassword("");
  }, [tab]);

  // Mode: "login" | "forgot_email" | "forgot_otp" | "forgot_reset"
  const [mode, setMode] = useState<"login" | "forgot_email" | "forgot_otp" | "forgot_reset">("login");
  
  // Forgot Password States
  const [forgotEmail, setForgotEmail] = useState("");
  const [otpSessionToken, setOtpSessionToken] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hint, setHint] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setRejectionRemarks("");
    try {
      if (tab === "voter") {
        const res = await voterLoginStep1(email, password);
        saveOtpSession(res.otp_session_token, email);
        toast.success(res.hint);
        nav({ to: "/voter/otp-verify" });
      } else {
        const mobileNum = mobile.replace(/\s/g, "");
        
        if (candidateStep === "email_mobile") {
          const res = await candidateCheckStatus(email, mobileNum);
          if (res.status === "exists") {
            setCandidateStep("password");
            setLoading(false);
          } else if (res.status === "eligible") {
            if (res.token) {
              saveAuth(res.token, "candidate", "", res.voter_details?.full_name || "", res.voter_details?.department || "", res.voter_details?.semester || "");
              sessionStorage.setItem("candidate-prefill-name", res.voter_details?.full_name || "");
              sessionStorage.setItem("candidate-prefill-department", res.voter_details?.department || "");
              sessionStorage.setItem("candidate-prefill-semester", res.voter_details?.semester || "");
              saveOtpSession(res.token, email, mobileNum);
            }
            toast.success("Eligible voter profile found. Complete candidate registration.");
            nav({ to: "/candidate/register" });
          } else if (res.status === "need_year") {
            setCandidateStep("select_year");
            setLoading(false);
          } else if (res.status === "ineligible") {
            setError(res.reason || "You are not eligible for candidate registration.");
            toast.error(res.reason || "Eligibility check failed.");
            setLoading(false);
          }
        } else if (candidateStep === "password") {
          const res = await candidateLoginStep1(email, mobileNum, password);
          saveOtpSession(res.otp_session_token, email, mobileNum);
          toast.success(res.hint);
          nav({ to: "/candidate/otp-verify" });
        } else if (candidateStep === "select_year") {
          const yrNum = parseInt(candidateYear, 10);
          if (yrNum === 1 || yrNum === 2) {
            setError("Only 3rd and 4th year students are eligible to contest in elections.");
            toast.error("Only 3rd and 4th year students are eligible.");
            setLoading(false);
          } else if (yrNum === 3 || yrNum === 4) {
            const res = await candidateInitiateNew(email, mobileNum, yrNum);
            if (res.status === "eligible" && res.token) {
              saveAuth(res.token, "candidate", "", "", "", "");
              saveOtpSession(res.token, email, mobileNum);
              sessionStorage.removeItem("candidate-prefill-name");
              sessionStorage.removeItem("candidate-prefill-department");
              sessionStorage.removeItem("candidate-prefill-semester");
              toast.success("College email verified. Set your password to register.");
              nav({ to: "/candidate/register" });
            } else {
              setError(res.reason || "Verification failed.");
              toast.error(res.reason || "Verification failed.");
              setLoading(false);
            }
          } else {
            toast.error("Please select your year of study.");
            setLoading(false);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
      if (err.remarks) {
        setRejectionRemarks(err.remarks);
      }
      toast.error(err.message || "Failed.");
      setLoading(false);
    }
  }

  async function handleForgotEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail) {
      toast.error("Please enter your college email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await requestForgotPassword(forgotEmail);
      setOtpSessionToken(res.otp_session_token);
      setHint(res.hint);
      toast.success(res.hint);
      setMode("forgot_otp");
    } catch (err: any) {
      setError(err.message || "Failed to request password reset.");
      toast.error(err.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotOtp || forgotOtp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP code.");
      return;
    }
    setMode("forgot_reset");
  }

  async function handleForgotResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await confirmForgotPassword(otpSessionToken, forgotOtp, newPassword);
      toast.success(res.message || "Password reset successfully!");
      
      // Reset forms and return to login
      setMode("login");
      setForgotEmail("");
      setForgotOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to reset password. Please try again.");
      toast.error(err.message || "Reset failed.");
    } finally {
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
        <div className="w-full max-w-md animate-fade-in">
          
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-lg bg-[#1F3A6E] flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-semibold text-lg">CollegeVote</span>
          </div>

          {error && (
            <div className="mb-4 flex flex-col gap-1.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 animate-shake">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>
              </div>
              {rejectionRemarks && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-500 border-t border-red-200/50 dark:border-red-800/50 pt-2 font-medium">
                  <span className="font-bold text-red-700 dark:text-red-400">Admin Remarks: </span>
                  "{rejectionRemarks}"
                </div>
              )}
            </div>
          )}

          {/* ────────────────────────────────────────────────────────
              LOGIN STATE
              ──────────────────────────────────────────────────────── */}
          {mode === "login" && (
            <>
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

              <form onSubmit={submit} className="mt-6 space-y-4">
                {tab === "voter" ? (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">College Email</label>
                      <Input type="email" required placeholder="yourname@college.edu.in" className="mt-1.5 h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-muted-foreground">Password</label>
                        <button 
                          type="button" 
                          onClick={() => { setError(""); setMode("forgot_email"); }}
                          className="text-xs text-[#6C63FF] font-semibold hover:underline"
                        >
                          Forgot Password?
                        </button>
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
                  </>
                ) : (
                  // Candidate Tab Flow
                  <>
                    {candidateStep === "email_mobile" && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">College Email</label>
                          <Input type="email" required placeholder="yourname@college.edu.in" className="mt-1.5 h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
                          <div className="mt-1.5 flex">
                            <span className="inline-flex items-center px-3 border border-r-0 border-border bg-muted rounded-l-md text-sm">+91</span>
                            <Input type="tel" required placeholder="98765 43210" className="rounded-l-none h-11" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                          </div>
                        </div>
                        <Button type="submit" disabled={loading} className="w-full h-11 bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white mt-2">
                          {loading ? "Checking eligibility..." : "Continue"}
                        </Button>
                      </>
                    )}

                    {candidateStep === "password" && (
                      <>
                        <div className="bg-muted/50 border border-border p-3.5 rounded-xl text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Email:</span>
                            <span className="font-semibold">{email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Phone:</span>
                            <span className="font-semibold">+91 {mobile}</span>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">Password</label>
                            <button 
                              type="button" 
                              onClick={() => { setError(""); setMode("forgot_email"); }}
                              className="text-xs text-[#6C63FF] font-semibold hover:underline"
                            >
                              Forgot Password?
                            </button>
                          </div>
                          <div className="mt-1.5 relative">
                            <Input type={show ? "text" : "password"} required placeholder="••••••••" className="pr-10 h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
                            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-3 mt-2">
                          <Button
                            type="button"
                            onClick={() => {
                              setCandidateStep("email_mobile");
                              setError("");
                              setPassword("");
                            }}
                            variant="outline"
                            className="flex-1 h-11 border border-border hover:bg-muted"
                          >
                            Back
                          </Button>
                          <Button type="submit" disabled={loading} className="flex-1 h-11 bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white">
                            {loading ? "Signing in..." : "Login"}
                          </Button>
                        </div>
                      </>
                    )}

                    {candidateStep === "select_year" && (
                      <>
                        <div className="bg-muted/50 border border-border p-3.5 rounded-xl text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Email:</span>
                            <span className="font-semibold">{email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Phone:</span>
                            <span className="font-semibold">+91 {mobile}</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Select Your Year of Study</label>
                          <select
                            value={candidateYear}
                            onChange={(e) => setCandidateYear(e.target.value)}
                            required
                            className="mt-1.5 w-full h-11 px-3 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <option value="">-- Choose Year --</option>
                            <option value="1">1st Year</option>
                            <option value="2">2nd Year</option>
                            <option value="3">3rd Year (Eligible)</option>
                            <option value="4">4th Year (Eligible)</option>
                          </select>
                        </div>
                        <div className="flex gap-3 mt-2">
                          <Button
                            type="button"
                            onClick={() => {
                              setCandidateStep("email_mobile");
                              setError("");
                              setCandidateYear("");
                            }}
                            variant="outline"
                            className="flex-1 h-11 border border-border hover:bg-muted"
                          >
                            Back
                          </Button>
                          <Button type="submit" disabled={loading} className="flex-1 h-11 bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white">
                            {loading ? "Continuing..." : "Continue"}
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </form>
            </>
          )}

          {/* ────────────────────────────────────────────────────────
              FORGOT EMAIL STATE
              ──────────────────────────────────────────────────────── */}
          {mode === "forgot_email" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <button 
                  onClick={() => setMode("login")} 
                  className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Forgot Password</span>
              </div>
              <h2 className="text-2xl font-bold">Find your account</h2>
              <p className="text-sm text-muted-foreground mt-1">Enter your registered college email to receive a secure OTP code.</p>

              <form onSubmit={handleForgotEmailSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">College Email</label>
                  <Input 
                    type="email" 
                    required 
                    placeholder="voter@college.edu.in" 
                    className="mt-1.5 h-11" 
                    value={forgotEmail} 
                    onChange={(e) => setForgotEmail(e.target.value)} 
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full h-11 bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white">
                  {loading ? "Processing..." : "Send Reset OTP"}
                </Button>
              </form>
            </>
          )}

          {/* ────────────────────────────────────────────────────────
              FORGOT OTP STATE
              ──────────────────────────────────────────────────────── */}
          {mode === "forgot_otp" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <button 
                  onClick={() => setMode("forgot_email")} 
                  className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Verification</span>
              </div>
              <h2 className="text-2xl font-bold">Verify Identity</h2>
              <p className="text-sm text-muted-foreground mt-1">We sent a verification code to check it's really you.</p>

              <div className="mt-4 p-3.5 bg-blue-500/10 rounded-xl border border-blue-500/20 flex items-start gap-2.5">
                <Mail className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium leading-relaxed">
                  {hint}
                </p>
              </div>

              <form onSubmit={handleForgotOtpSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">6-Digit Email OTP</label>
                  <Input 
                    type="text" 
                    maxLength={6} 
                    required 
                    placeholder="000000" 
                    className="mt-1.5 h-12 text-center text-xl font-bold tracking-[0.3em] bg-muted/40" 
                    value={forgotOtp} 
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ""))} 
                  />
                </div>
                <Button type="submit" className="w-full h-11 bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white">
                  Continue
                </Button>
              </form>
            </>
          )}

          {/* ────────────────────────────────────────────────────────
              FORGOT RESET STATE
              ──────────────────────────────────────────────────────── */}
          {mode === "forgot_reset" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Reset Security</span>
              </div>
              <h2 className="text-2xl font-bold">Choose a new password</h2>
              <p className="text-sm text-muted-foreground mt-1">Create a secure new password for your election portal account.</p>

              <form onSubmit={handleForgotResetSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">New Password</label>
                  <Input 
                    type="password" 
                    required 
                    placeholder="••••••••" 
                    className="mt-1.5 h-11" 
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Confirm Password</label>
                  <Input 
                    type="password" 
                    required 
                    placeholder="••••••••" 
                    className="mt-1.5 h-11" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full h-11 bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white">
                  {loading ? "Saving Password..." : "Reset & Back to Login"}
                </Button>
              </form>
            </>
          )}

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

