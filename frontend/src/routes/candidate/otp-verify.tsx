import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Phone, ShieldCheck, AlertCircle } from "lucide-react";
import { OtpInput } from "@/components/OtpInput";
import { Countdown } from "@/components/Countdown";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  candidateLoginStep2,
  getOtpSession,
  saveAuth,
  resendCandidateOtp,
  saveOtpSession,
  resendCandidateEmailOtp,
  resendCandidateSmsOtp,
} from "@/lib/api";

export const Route = createFileRoute("/candidate/otp-verify")({ component: Page });

function Page() {
  const nav = useNavigate();
  const { login, setCandidateRegistered } = useAuth();
  const [emailOtp, setEmailOtp] = useState(Array(6).fill(""));
  const [phoneOtp, setPhoneOtp] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailResendIn, setEmailResendIn] = useState(60);
  const [phoneResendIn, setPhoneResendIn] = useState(60);

  const ready = emailOtp.every((d) => d) && phoneOtp.every((d) => d);
  const { sessionToken: initialToken, email, mobile } = getOtpSession();
  const [sessionToken, setSessionToken] = useState(initialToken);

  // If no session token, redirect back
  useEffect(() => {
    if (!sessionToken) nav({ to: "/" });
  }, []);

  useEffect(() => {
    if (emailResendIn <= 0) return;
    const t = setTimeout(() => setEmailResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [emailResendIn]);

  useEffect(() => {
    if (phoneResendIn <= 0) return;
    const t = setTimeout(() => setPhoneResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [phoneResendIn]);

  async function verify() {
    if (!ready) return;
    setError("");
    setLoading(true);
    try {
      const emailOtpStr = emailOtp.join("");
      const phoneOtpStr = phoneOtp.join("");
      const res = await candidateLoginStep2(sessionToken, emailOtpStr, phoneOtpStr);
      saveAuth(
        res.access_token,
        res.role,
        res.user_id,
        res.full_name,
        res.department,
        res.semester,
        (res as any).csrf_token,
      );
      login("candidate");
      toast.success("Both OTPs verified!");

      const isRegistered = !!res.is_registered;
      setCandidateRegistered(isRegistered);

      if (!isRegistered) {
        sessionStorage.setItem("candidate-prefill-name", res.full_name || "");
        sessionStorage.setItem("candidate-prefill-department", res.department || "");
        sessionStorage.setItem("candidate-prefill-semester", res.semester || "");
        sessionStorage.setItem("candidate-prefill-usn", (res as any).student_id || "");
      }

      nav({ to: isRegistered ? "/candidate/dashboard" : "/candidate/register" });
    } catch (err: any) {
      setError(err.message || "OTP verification failed. Please check both codes.");
      setLoading(false);
    }
  }

  async function resendEmail() {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const res = await resendCandidateEmailOtp(sessionToken);
      saveOtpSession(res.otp_session_token, email, mobile);
      setSessionToken(res.otp_session_token);
      toast.success(res.message || "Email OTP resent successfully!");
      setEmailResendIn(60);
    } catch (err: any) {
      setError(err.message || "Failed to resend Email OTP.");
      toast.error(err.message || "Resend failed.");
    } finally {
      setLoading(false);
    }
  }

  async function resendPhone() {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const res = await resendCandidateSmsOtp(sessionToken);
      saveOtpSession(res.otp_session_token, email, mobile);
      setSessionToken(res.otp_session_token);
      toast.success(res.message || "SMS OTP resent successfully!");
      setPhoneResendIn(60);
    } catch (err: any) {
      setError(err.message || "Failed to resend SMS OTP.");
      toast.error(err.message || "Resend failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center premium-bg p-4 py-8">
      <div className="w-full max-w-md glass-panel rounded-[24px] shadow-2xl p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-full bg-[#0F8A5F]/10 flex items-center justify-center mb-4 ring-4 ring-[#0F8A5F]/5">
            <ShieldCheck className="h-7 w-7 text-[#0F8A5F]" />
          </div>
          <h1 className="text-2xl font-bold text-[#102A27]">Two-step verification</h1>
          <p className="text-sm text-muted-foreground mt-2 font-medium">
            Enter both OTPs sent to your email and phone.
          </p>
        </div>

        <Section
          icon={<Mail className="h-4 w-4" />}
          title="Email OTP"
          subtitle={
            email
              ? `Sent to ${email.slice(0, 2)}***@${email.split("@")[1]}`
              : "Sent to your college email"
          }
        >
          <OtpInput value={emailOtp} onChange={setEmailOtp} />
          <div className="flex items-center justify-between mt-2.5">
            <p className="text-[11px] text-muted-foreground font-medium">
              Expires in <span className="text-[#D97706] font-bold"><Countdown seconds={5 * 60} /></span>
            </p>
            <button
              type="button"
              disabled={emailResendIn > 0 || loading}
              onClick={resendEmail}
              className="text-[11px] text-[#0F8A5F] font-bold hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {emailResendIn > 0 ? `Resend in ${emailResendIn}s` : "Resend Email OTP"}
            </button>
          </div>
        </Section>

        <div className="my-6 border-t border-[#E6ECE9]" />

        <Section
          icon={<Phone className="h-4 w-4" />}
          title="Phone OTP"
          subtitle={mobile ? `Sent to +91-XXXXXX${mobile.slice(-4)}` : "Sent via SMS"}
        >
          <OtpInput value={phoneOtp} onChange={setPhoneOtp} />
          <div className="flex items-center justify-between mt-2.5">
            <p className="text-[11px] text-muted-foreground font-medium">
              Expires in <span className="text-[#D97706] font-bold"><Countdown seconds={5 * 60} /></span>
            </p>
            <button
              type="button"
              disabled={phoneResendIn > 0 || loading}
              onClick={resendPhone}
              className="text-[11px] text-[#0F8A5F] font-bold hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {phoneResendIn > 0 ? `Resend in ${phoneResendIn}s` : "Resend SMS OTP"}
            </button>
          </div>
        </Section>

        {error && (
          <div className="flex items-center gap-2 mt-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <Button
          onClick={verify}
          disabled={!ready || loading}
          className="w-full mt-7 bg-gradient-to-r from-primary-dark to-primary text-white hover:opacity-95 rounded-xl font-bold border-0 shadow-md shadow-[#0F8A5F]/20"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Verifying...
            </span>
          ) : (
            "Verify Both & Continue"
          )}
        </Button>

        <button
          onClick={() => nav({ to: "/" })}
          className="w-full text-xs text-center text-muted-foreground hover:text-[#102A27] mt-4 transition-colors font-medium"
        >
          ← Back to Login
        </button>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-foreground/70">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
