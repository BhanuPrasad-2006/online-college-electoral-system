import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  Eye,
  EyeOff,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  ArrowLeft,
  Mail,
  User,
  Lock,
  Phone,
  ChevronRight,
  Vote,
  BarChart3,
  Users,
} from "lucide-react";
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
  saveAuth,
} from "@/lib/api";
import { toast } from "sonner";
import { SSRRecaptcha } from "@/components/SSRRecaptcha";

export const Route = createFileRoute("/")({ component: Login });

// ── Animated floating particle ────────────────────────────────
function Particle({
  style,
  className,
}: {
  style: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={style}
    />
  );
}

// ── Glassmorphism input wrapper ───────────────────────────────
function GlassInput({
  icon,
  label,
  id,
  rightSlot,
  inputClassName,
  ...props
}: {
  icon: React.ReactNode;
  label: string;
  id: string;
  rightSlot?: React.ReactNode;
  inputClassName?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-[11px] font-semibold tracking-widest uppercase"
        style={{ color: "rgba(180,200,255,0.65)" }}
      >
        {label}
      </label>
      <div className="relative">
        <span
          className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "rgba(150,180,255,0.5)" }}
        >
          {icon}
        </span>
        <input
          id={id}
          {...props}
          className={`w-full h-12 pl-10 pr-4 rounded-xl text-sm font-medium outline-none transition-all duration-200 placeholder:font-normal ${inputClassName ?? ""}`}
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(230,240,255,0.95)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            ...(props.style || {}),
          }}
          onFocus={(e) => {
            e.currentTarget.style.border = "1px solid rgba(139,120,255,0.5)";
            e.currentTarget.style.background = "rgba(255,255,255,0.10)";
            e.currentTarget.style.boxShadow =
              "0 0 0 3px rgba(108,99,255,0.15), inset 0 1px 0 rgba(255,255,255,0.08)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)";
            e.currentTarget.style.background = "rgba(255,255,255,0.07)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        {rightSlot && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
            {rightSlot}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Glass button ──────────────────────────────────────────────
function GlassButton({
  children,
  variant = "primary",
  disabled,
  onClick,
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
}) {
  if (variant === "ghost") {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`h-11 px-5 rounded-xl text-sm font-semibold transition-all duration-200 ${className}`}
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.14)",
          color: "rgba(200,215,255,0.85)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.12)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`h-12 w-full rounded-xl text-sm font-bold transition-all duration-200 relative overflow-hidden ${className}`}
      style={{
        background: disabled
          ? "rgba(108,99,255,0.3)"
          : "linear-gradient(135deg, rgba(108,99,255,0.9) 0%, rgba(139,92,246,0.85) 100%)",
        border: "1px solid rgba(167,139,250,0.4)",
        color: disabled ? "rgba(255,255,255,0.4)" : "white",
        boxShadow: disabled
          ? "none"
          : "0 4px 24px rgba(108,99,255,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow =
            "0 8px 32px rgba(108,99,255,0.45), inset 0 1px 0 rgba(255,255,255,0.2)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = disabled
          ? "none"
          : "0 4px 24px rgba(108,99,255,0.35), inset 0 1px 0 rgba(255,255,255,0.2)";
      }}
    >
      {/* Shimmer effect */}
      {!disabled && (
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 3s ease-in-out infinite",
          }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

// ── Stat card (left panel) ────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delay: number;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        animation: `fade-in-up 0.6s ${delay}ms cubic-bezier(0.22,1,0.36,1) both`,
      }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: "rgba(108,99,255,0.25)" }}
      >
        {icon}
      </div>
      <div>
        <p
          className="text-xs font-medium"
          style={{ color: "rgba(180,200,255,0.6)" }}
        >
          {label}
        </p>
        <p
          className="text-sm font-bold"
          style={{ color: "rgba(230,240,255,0.95)" }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function Login() {
  const nav = useNavigate();
  const { role, isAuthed, authReady } = useAuth();

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      !sessionStorage.getItem("collegevote-fingerprint")
    ) {
      import("@/lib/device-fingerprint").then((mod) =>
        mod
          .getDeviceFingerprint()
          .then((fp) =>
            sessionStorage.setItem("collegevote-fingerprint", fp),
          ),
      );
    }
  }, []);

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

  // CAPTCHA
  const [voterCaptchaToken, setVoterCaptchaToken] = useState<string | null>(null);
  const [candidateCaptchaToken, setCandidateCaptchaToken] = useState<string | null>(null);
  const voterRecaptchaRef = useRef<any>(null);
  const candidateRecaptchaRef = useRef<any>(null);

  // Candidate Sub-Steps
  const [candidateStep, setCandidateStep] = useState<
    "email_mobile" | "password" | "select_year"
  >("email_mobile");
  const [candidateYear, setCandidateYear] = useState<string>("");
  const [showSecondCaptcha, setShowSecondCaptcha] = useState(false);

  useEffect(() => {
    setCandidateStep("email_mobile");
    setError("");
    setRejectionRemarks("");
    setCandidateYear("");
    setPassword("");
    setVoterCaptchaToken(null);
    setCandidateCaptchaToken(null);
    setShowSecondCaptcha(false);
    voterRecaptchaRef.current?.reset();
    candidateRecaptchaRef.current?.reset();
  }, [tab]);

  const [mode, setMode] = useState<
    "login" | "forgot_email" | "forgot_otp" | "forgot_reset"
  >("login");

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
        if (!voterCaptchaToken) throw new Error("Please complete CAPTCHA verification.");
        const res = await voterLoginStep1(email, password, voterCaptchaToken);
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
              sessionStorage.setItem("candidate-prefill-usn", (res.voter_details as any)?.student_id || "");
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
          if (!candidateCaptchaToken) throw new Error("Please complete CAPTCHA verification.");
          const res = await candidateLoginStep1(email, mobileNum, password, candidateCaptchaToken);
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
              sessionStorage.removeItem("candidate-prefill-usn");
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
      if (err.remarks) setRejectionRemarks(err.remarks);
      toast.error(err.message || "Failed.");
      setLoading(false);
      voterRecaptchaRef.current?.reset();
      setVoterCaptchaToken(null);
      candidateRecaptchaRef.current?.reset();
      setCandidateCaptchaToken(null);
      if (candidateStep === "password" || candidateStep === "select_year") {
        setShowSecondCaptcha(true);
      }
    }
  }

  async function handleForgotEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail) { toast.error("Please enter your college email address."); return; }
    setLoading(true); setError("");
    try {
      const res = await requestForgotPassword(forgotEmail);
      setOtpSessionToken(res.otp_session_token);
      setHint(res.hint);
      toast.success(res.hint);
      setMode("forgot_otp");
    } catch (err: any) {
      setError(err.message || "Failed to request password reset.");
      toast.error(err.message || "Request failed.");
    } finally { setLoading(false); }
  }

  async function handleForgotOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotOtp || forgotOtp.length !== 6) { toast.error("Please enter a valid 6-digit OTP code."); return; }
    setMode("forgot_reset");
  }

  async function handleForgotResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword || !confirmPassword) { toast.error("Please fill in all password fields."); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match."); return; }
    if (newPassword.length < 6) { toast.error("New password must be at least 6 characters long."); return; }
    setLoading(true); setError("");
    try {
      const res = await confirmForgotPassword(otpSessionToken, forgotOtp, newPassword);
      toast.success(res.message || "Password reset successfully!");
      setMode("login");
      setForgotEmail(""); setForgotOtp(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to reset password. Please try again.");
      toast.error(err.message || "Reset failed.");
    } finally { setLoading(false); }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #070b1a 0%, #0d1530 30%, #111840 60%, #0a0e25 100%)",
      }}
    >
      {/* ── Animated background elements ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Large glow blobs */}
        <div
          className="absolute rounded-full"
          style={{
            width: 600,
            height: 600,
            top: "-15%",
            left: "-10%",
            background:
              "radial-gradient(circle, rgba(108,99,255,0.12) 0%, transparent 70%)",
            filter: "blur(40px)",
            animation: "float-slow 16s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 500,
            height: 500,
            bottom: "-10%",
            right: "-8%",
            background:
              "radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)",
            filter: "blur(50px)",
            animation: "float-slow 20s ease-in-out infinite reverse",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 400,
            height: 400,
            top: "40%",
            right: "20%",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)",
            filter: "blur(60px)",
            animation: "float 12s ease-in-out infinite",
          }}
        />

        {/* Grid lines */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(108,99,255,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(108,99,255,0.04) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />

        {/* Floating particles */}
        {[
          { w: 3, h: 3, top: "15%", left: "20%", color: "rgba(108,99,255,0.5)", delay: 0, dur: 8 },
          { w: 2, h: 2, top: "35%", left: "8%", color: "rgba(56,189,248,0.4)", delay: 2, dur: 11 },
          { w: 4, h: 4, top: "65%", left: "15%", color: "rgba(139,92,246,0.4)", delay: 1, dur: 9 },
          { w: 2, h: 2, top: "80%", left: "30%", color: "rgba(108,99,255,0.35)", delay: 3, dur: 13 },
          { w: 3, h: 3, top: "10%", right: "25%", color: "rgba(56,189,248,0.4)", delay: 0.5, dur: 10 },
          { w: 2, h: 2, top: "55%", right: "12%", color: "rgba(108,99,255,0.5)", delay: 2.5, dur: 8 },
          { w: 5, h: 5, top: "88%", right: "35%", color: "rgba(139,92,246,0.3)", delay: 1.5, dur: 14 },
          { w: 2, h: 2, top: "25%", right: "5%", color: "rgba(56,189,248,0.45)", delay: 0.8, dur: 10 },
        ].map((p, i) => (
          <Particle
            key={i}
            style={{
              width: p.w,
              height: p.h,
              top: p.top,
              left: (p as any).left,
              right: (p as any).right,
              background: p.color,
              borderRadius: "50%",
              animation: `float ${p.dur}s ${p.delay}s ease-in-out infinite alternate`,
              boxShadow: `0 0 ${p.w * 3}px ${p.color}`,
            }}
          />
        ))}

        {/* Glowing lines */}
        <div
          className="absolute"
          style={{
            top: "30%",
            left: 0,
            right: 0,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(108,99,255,0.15), transparent)",
          }}
        />
        <div
          className="absolute"
          style={{
            top: "70%",
            left: 0,
            right: 0,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(56,189,248,0.1), transparent)",
          }}
        />
      </div>

      {/* ── Main layout ── */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-8 flex flex-col lg:flex-row items-center gap-8 lg:gap-12">

        {/* ── LEFT: Brand panel ── */}
        <div
          className="hidden lg:flex flex-col gap-6 flex-1 max-w-sm"
          style={{ animation: "fade-in-up 0.7s 100ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(108,99,255,0.4), rgba(139,92,246,0.3))",
                border: "1px solid rgba(167,139,250,0.3)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxShadow: "0 4px 20px rgba(108,99,255,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-lg leading-none">CollegeVote</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(180,200,255,0.5)" }}>
                Student Election Portal
              </p>
            </div>
          </div>

          {/* Headline */}
          <div>
            <h1
              className="text-4xl font-extrabold leading-tight"
              style={{
                background: "linear-gradient(135deg, #e2e8ff 0%, #a5b4fc 50%, #c4b5fd 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Your Vote.
              <br />
              Your Voice.
              <br />
              Your Future.
            </h1>
            <p
              className="text-sm mt-4 leading-relaxed"
              style={{ color: "rgba(180,200,255,0.6)" }}
            >
              Secure, AI-powered student council elections. Every vote is
              encrypted, verified, and anonymous.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-2.5">
            {[
              { icon: <ShieldCheck className="h-4 w-4" />, text: "Multi-factor secure authentication" },
              { icon: <Sparkles className="h-4 w-4" />, text: "AI-powered candidate matching" },
              { icon: <GraduationCap className="h-4 w-4" />, text: "Built for student council elections" },
            ].map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3"
                style={{
                  animation: `fade-in-up 0.6s ${300 + i * 100}ms cubic-bezier(0.22,1,0.36,1) both`,
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(108,99,255,0.2)", color: "rgba(167,139,250,0.9)" }}
                >
                  {f.icon}
                </div>
                <span className="text-sm" style={{ color: "rgba(200,215,255,0.75)" }}>
                  {f.text}
                </span>
              </div>
            ))}
          </div>

          {/* Stat cards */}
          <div className="space-y-2 pt-2">
            <StatCard icon={<Vote className="h-4 w-4 text-purple-300" />} label="Live Vote Tracker" value="7,812 Votes Cast" delay={500} />
            <StatCard icon={<Users className="h-4 w-4 text-blue-300" />} label="Voter Turnout" value="68% So Far" delay={600} />
            <StatCard icon={<BarChart3 className="h-4 w-4 text-cyan-300" />} label="Final Manifestos" value="All Released" delay={700} />
          </div>
        </div>

        {/* ── RIGHT: Glass login card ── */}
        <div
          className="w-full max-w-md flex-shrink-0"
          style={{ animation: "fade-in-up 0.7s 200ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          {/* Glass card */}
          <div
            className="rounded-3xl p-8 relative overflow-hidden"
            style={{
              background: "rgba(14,20,50,0.55)",
              backdropFilter: "blur(40px) saturate(1.6)",
              WebkitBackdropFilter: "blur(40px) saturate(1.6)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow:
                "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(108,99,255,0.08), inset 0 1px 0 rgba(255,255,255,0.09)",
            }}
          >
            {/* Inner glow */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.5), transparent)",
              }}
            />

            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-2.5 mb-6">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(108,99,255,0.5), rgba(139,92,246,0.4))",
                  border: "1px solid rgba(167,139,250,0.3)",
                }}
              >
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-white">CollegeVote</span>
            </div>

            {/* Error banner */}
            {error && (
              <div
                className="mb-5 flex flex-col gap-1.5 rounded-2xl p-4"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <p className="text-sm font-semibold text-red-300">{error}</p>
                </div>
                {rejectionRemarks && (
                  <div
                    className="text-xs text-red-400 pt-2 mt-1"
                    style={{ borderTop: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    <span className="font-bold">Admin Remarks: </span>"{rejectionRemarks}"
                  </div>
                )}
              </div>
            )}

            {/* ── LOGIN MODE ── */}
            {mode === "login" && (
              <>
                <div className="mb-7">
                  <h2
                    className="text-2xl font-bold"
                    style={{ color: "rgba(230,240,255,0.97)" }}
                  >
                    Welcome back
                  </h2>
                  <p className="text-sm mt-1" style={{ color: "rgba(180,200,255,0.55)" }}>
                    Student Council Election 2026
                  </p>
                </div>

                {/* Tab switcher */}
                <div
                  className="flex p-1 rounded-2xl mb-6"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {(["voter", "candidate"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300"
                      style={
                        tab === t
                          ? {
                              background: "linear-gradient(135deg, rgba(108,99,255,0.7), rgba(139,92,246,0.6))",
                              color: "white",
                              boxShadow: "0 2px 12px rgba(108,99,255,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
                            }
                          : { color: "rgba(180,200,255,0.5)" }
                      }
                    >
                      {t === "voter" ? (
                        <User className="h-3.5 w-3.5" />
                      ) : (
                        <GraduationCap className="h-3.5 w-3.5" />
                      )}
                      Login as {t === "voter" ? "Voter" : "Candidate"}
                    </button>
                  ))}
                </div>

                <form onSubmit={submit} className="space-y-4">
                  {tab === "voter" ? (
                    <>
                      <GlassInput
                        id="voter-email"
                        icon={<Mail className="h-4 w-4" />}
                        label="College Email"
                        type="email"
                        required
                        placeholder="yourname@college.edu.in"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <GlassInput
                        id="voter-password"
                        icon={<Lock className="h-4 w-4" />}
                        label="Password"
                        type={show ? "text" : "password"}
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        rightSlot={
                          <button
                            type="button"
                            onClick={() => setShow((s) => !s)}
                            style={{ color: "rgba(150,180,255,0.5)" }}
                          >
                            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        }
                      />
                      <div className="flex justify-end -mt-1">
                        <button
                          type="button"
                          onClick={() => { setError(""); setMode("forgot_email"); }}
                          className="text-xs font-semibold transition-colors"
                          style={{ color: "rgba(167,139,250,0.8)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(167,139,250,1)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(167,139,250,0.8)")}
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <SSRRecaptcha
                        recaptchaRef={voterRecaptchaRef}
                        onChange={(token) => setVoterCaptchaToken(token)}
                        onExpired={() => setVoterCaptchaToken(null)}
                      />
                      <GlassButton
                        type="submit"
                        disabled={loading || !email || !password || !voterCaptchaToken}
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Signing in...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            Login
                            <ChevronRight className="h-4 w-4" />
                          </span>
                        )}
                      </GlassButton>
                    </>
                  ) : (
                    <>
                      {/* Candidate: email_mobile step */}
                      {candidateStep === "email_mobile" && (
                        <>
                          <GlassInput
                            id="cand-email"
                            icon={<Mail className="h-4 w-4" />}
                            label="College Email"
                            type="email"
                            required
                            placeholder="yourname@college.edu.in"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                          <div className="space-y-1.5">
                            <label
                              className="text-[11px] font-semibold tracking-widest uppercase"
                              style={{ color: "rgba(180,200,255,0.65)" }}
                            >
                              Phone Number
                            </label>
                            <div className="flex">
                              <span
                                className="inline-flex items-center px-3.5 text-sm rounded-l-xl font-semibold flex-shrink-0"
                                style={{
                                  background: "rgba(255,255,255,0.06)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  borderRight: "none",
                                  color: "rgba(180,200,255,0.7)",
                                }}
                              >
                                +91
                              </span>
                              <input
                                type="tel"
                                required
                                placeholder="98765 43210"
                                className="flex-1 h-12 px-4 text-sm font-medium outline-none transition-all duration-200"
                                style={{
                                  background: "rgba(255,255,255,0.07)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  borderRadius: "0 0.75rem 0.75rem 0",
                                  color: "rgba(230,240,255,0.95)",
                                  backdropFilter: "blur(8px)",
                                  WebkitBackdropFilter: "blur(8px)",
                                }}
                                value={mobile}
                                onChange={(e) => setMobile(e.target.value)}
                                onFocus={(e) => {
                                  e.currentTarget.style.border = "1px solid rgba(139,120,255,0.5)";
                                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(108,99,255,0.15)";
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)";
                                  e.currentTarget.style.boxShadow = "none";
                                }}
                              />
                            </div>
                          </div>
                          <SSRRecaptcha
                            recaptchaRef={candidateRecaptchaRef}
                            onChange={(token) => setCandidateCaptchaToken(token)}
                            onExpired={() => setCandidateCaptchaToken(null)}
                          />
                          <GlassButton type="submit" disabled={loading || !candidateCaptchaToken}>
                            {loading ? (
                              <span className="flex items-center justify-center gap-2">
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Checking eligibility...
                              </span>
                            ) : (
                              <span className="flex items-center justify-center gap-2">
                                Continue
                                <ChevronRight className="h-4 w-4" />
                              </span>
                            )}
                          </GlassButton>
                        </>
                      )}

                      {/* Candidate: password step */}
                      {candidateStep === "password" && (
                        <>
                          <div
                            className="rounded-2xl p-3.5 text-xs space-y-2"
                            style={{
                              background: "rgba(108,99,255,0.08)",
                              border: "1px solid rgba(108,99,255,0.2)",
                            }}
                          >
                            <div className="flex justify-between">
                              <span style={{ color: "rgba(180,200,255,0.55)" }}>Email</span>
                              <span className="font-semibold" style={{ color: "rgba(230,240,255,0.9)" }}>{email}</span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ color: "rgba(180,200,255,0.55)" }}>Phone</span>
                              <span className="font-semibold" style={{ color: "rgba(230,240,255,0.9)" }}>+91 {mobile}</span>
                            </div>
                          </div>
                          <GlassInput
                            id="cand-password"
                            icon={<Lock className="h-4 w-4" />}
                            label="Password"
                            type={show ? "text" : "password"}
                            required
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            rightSlot={
                              <button
                                type="button"
                                onClick={() => setShow((s) => !s)}
                                style={{ color: "rgba(150,180,255,0.5)" }}
                              >
                                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            }
                          />
                          <div className="flex justify-end -mt-1">
                            <button
                              type="button"
                              onClick={() => { setError(""); setMode("forgot_email"); }}
                              className="text-xs font-semibold"
                              style={{ color: "rgba(167,139,250,0.8)" }}
                            >
                              Forgot Password?
                            </button>
                          </div>
                          {showSecondCaptcha && (
                            <SSRRecaptcha
                              recaptchaRef={candidateRecaptchaRef}
                              onChange={(token) => setCandidateCaptchaToken(token)}
                              onExpired={() => setCandidateCaptchaToken(null)}
                            />
                          )}
                          <div className="flex gap-3">
                            <GlassButton
                              variant="ghost"
                              onClick={() => { setCandidateStep("email_mobile"); setError(""); setPassword(""); setCandidateCaptchaToken(null); setShowSecondCaptcha(false); candidateRecaptchaRef.current?.reset(); }}
                              className="flex-1"
                            >
                              <span className="flex items-center justify-center gap-1.5">
                                <ArrowLeft className="h-3.5 w-3.5" /> Back
                              </span>
                            </GlassButton>
                            <div className="flex-1">
                              <GlassButton type="submit" disabled={loading || !password || (showSecondCaptcha && !candidateCaptchaToken)}>
                                {loading ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Signing in...
                                  </span>
                                ) : "Login"}
                              </GlassButton>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Candidate: select_year step */}
                      {candidateStep === "select_year" && (
                        <>
                          <div
                            className="rounded-2xl p-3.5 text-xs space-y-2"
                            style={{
                              background: "rgba(108,99,255,0.08)",
                              border: "1px solid rgba(108,99,255,0.2)",
                            }}
                          >
                            <div className="flex justify-between">
                              <span style={{ color: "rgba(180,200,255,0.55)" }}>Email</span>
                              <span className="font-semibold" style={{ color: "rgba(230,240,255,0.9)" }}>{email}</span>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label
                              className="text-[11px] font-semibold tracking-widest uppercase"
                              style={{ color: "rgba(180,200,255,0.65)" }}
                            >
                              Year of Study
                            </label>
                            <select
                              value={candidateYear}
                              onChange={(e) => setCandidateYear(e.target.value)}
                              required
                              className="w-full h-12 px-4 rounded-xl text-sm font-medium outline-none transition-all duration-200"
                              style={{
                                background: "rgba(255,255,255,0.07)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "rgba(230,240,255,0.95)",
                                backdropFilter: "blur(8px)",
                                WebkitBackdropFilter: "blur(8px)",
                              }}
                            >
                              <option value="" style={{ background: "#1a1a4e" }}>-- Choose Year --</option>
                              <option value="1" style={{ background: "#1a1a4e" }}>1st Year</option>
                              <option value="2" style={{ background: "#1a1a4e" }}>2nd Year</option>
                              <option value="3" style={{ background: "#1a1a4e" }}>3rd Year (Eligible)</option>
                              <option value="4" style={{ background: "#1a1a4e" }}>4th Year (Eligible)</option>
                            </select>
                          </div>
                          {showSecondCaptcha && (
                            <SSRRecaptcha
                              recaptchaRef={candidateRecaptchaRef}
                              onChange={(token) => setCandidateCaptchaToken(token)}
                              onExpired={() => setCandidateCaptchaToken(null)}
                            />
                          )}
                          <div className="flex gap-3">
                            <GlassButton
                              variant="ghost"
                              onClick={() => { setCandidateStep("email_mobile"); setError(""); setCandidateYear(""); setCandidateCaptchaToken(null); setShowSecondCaptcha(false); candidateRecaptchaRef.current?.reset(); }}
                              className="flex-1"
                            >
                              <span className="flex items-center justify-center gap-1.5">
                                <ArrowLeft className="h-3.5 w-3.5" /> Back
                              </span>
                            </GlassButton>
                            <div className="flex-1">
                              <GlassButton type="submit" disabled={loading || (showSecondCaptcha && !candidateCaptchaToken)}>
                                {loading ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Continuing...
                                  </span>
                                ) : "Continue"}
                              </GlassButton>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </form>
              </>
            )}

            {/* ── FORGOT EMAIL MODE ── */}
            {mode === "forgot_email" && (
              <>
                <button
                  onClick={() => setMode("login")}
                  className="flex items-center gap-2 mb-5 text-xs font-semibold transition-colors"
                  style={{ color: "rgba(167,139,250,0.7)" }}
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Login
                </button>
                <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(230,240,255,0.97)" }}>
                  Find your account
                </h2>
                <p className="text-sm mb-6" style={{ color: "rgba(180,200,255,0.55)" }}>
                  Enter your registered college email to receive a secure OTP code.
                </p>
                <form onSubmit={handleForgotEmailSubmit} className="space-y-4">
                  <GlassInput
                    id="forgot-email"
                    icon={<Mail className="h-4 w-4" />}
                    label="College Email"
                    type="email"
                    required
                    placeholder="voter@college.edu.in"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                  <GlassButton type="submit" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processing...
                      </span>
                    ) : "Send Reset OTP"}
                  </GlassButton>
                </form>
              </>
            )}

            {/* ── FORGOT OTP MODE ── */}
            {mode === "forgot_otp" && (
              <>
                <button
                  onClick={() => setMode("forgot_email")}
                  className="flex items-center gap-2 mb-5 text-xs font-semibold"
                  style={{ color: "rgba(167,139,250,0.7)" }}
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(230,240,255,0.97)" }}>
                  Verify Identity
                </h2>
                <p className="text-sm mb-4" style={{ color: "rgba(180,200,255,0.55)" }}>
                  We sent a verification code — check it's really you.
                </p>
                <div
                  className="mb-5 p-3.5 rounded-2xl flex items-start gap-2.5"
                  style={{
                    background: "rgba(56,189,248,0.08)",
                    border: "1px solid rgba(56,189,248,0.2)",
                  }}
                >
                  <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "rgba(56,189,248,0.8)" }} />
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(147,210,240,0.85)" }}>
                    {hint}
                  </p>
                </div>
                <form onSubmit={handleForgotOtpSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      className="text-[11px] font-semibold tracking-widest uppercase"
                      style={{ color: "rgba(180,200,255,0.65)" }}
                    >
                      6-Digit OTP Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      placeholder="000000"
                      className="w-full h-14 text-center text-2xl font-bold tracking-[0.4em] rounded-xl outline-none transition-all"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "rgba(230,240,255,0.95)",
                        backdropFilter: "blur(8px)",
                        letterSpacing: "0.4em",
                      }}
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  <GlassButton type="submit">Continue</GlassButton>
                </form>
              </>
            )}

            {/* ── FORGOT RESET MODE ── */}
            {mode === "forgot_reset" && (
              <>
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-5 text-[11px] font-semibold"
                  style={{
                    background: "rgba(108,99,255,0.15)",
                    border: "1px solid rgba(108,99,255,0.3)",
                    color: "rgba(167,139,250,0.9)",
                  }}
                >
                  <ShieldCheck className="h-3 w-3" /> Reset Security
                </div>
                <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(230,240,255,0.97)" }}>
                  Choose a new password
                </h2>
                <p className="text-sm mb-6" style={{ color: "rgba(180,200,255,0.55)" }}>
                  Create a secure new password for your election portal account.
                </p>
                <form onSubmit={handleForgotResetSubmit} className="space-y-4">
                  <GlassInput
                    id="new-password"
                    icon={<Lock className="h-4 w-4" />}
                    label="New Password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <GlassInput
                    id="confirm-password"
                    icon={<Lock className="h-4 w-4" />}
                    label="Confirm Password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <GlassButton type="submit" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving Password...
                      </span>
                    ) : "Reset & Back to Login"}
                  </GlassButton>
                </form>
              </>
            )}

            {/* Footer */}
            <p
              className="text-center text-[11px] mt-7"
              style={{ color: "rgba(180,200,255,0.3)" }}
            >
              🔒 Protected by multi-factor authentication &amp; AI fraud detection
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
