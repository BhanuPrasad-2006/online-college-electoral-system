import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Phone, ShieldCheck, AlertCircle } from "lucide-react";
import { OtpInput } from "@/components/OtpInput";
import { Countdown } from "@/components/Countdown";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { candidateLoginStep2, getOtpSession, saveAuth } from "@/lib/api";

export const Route = createFileRoute("/candidate/otp-verify")({ component: Page });

function Page() {
  const nav = useNavigate();
  const { login, setCandidateRegistered } = useAuth();
  const [emailOtp, setEmailOtp] = useState(Array(6).fill(""));
  const [phoneOtp, setPhoneOtp] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ready = emailOtp.every((d) => d) && phoneOtp.every((d) => d);
  const { sessionToken, email, mobile } = getOtpSession();

  // If no session token, redirect back
  useEffect(() => {
    if (!sessionToken) nav({ to: "/" });
  }, []);

  async function verify() {
    if (!ready) return;
    setError("");
    setLoading(true);
    try {
      const emailOtpStr = emailOtp.join("");
      const phoneOtpStr = phoneOtp.join("");
      const res = await candidateLoginStep2(sessionToken, emailOtpStr, phoneOtpStr);
      saveAuth(res.access_token, res.role, res.user_id, res.full_name, res.department, res.semester);
      login("candidate");
      toast.success("Both OTPs verified!");
      
      const isRegistered = !!res.is_registered;
      setCandidateRegistered(isRegistered);

      if (!isRegistered) {
        sessionStorage.setItem("candidate-prefill-name", res.full_name || "");
        sessionStorage.setItem("candidate-prefill-department", res.department || "");
        sessionStorage.setItem("candidate-prefill-semester", res.semester || "");
      }

      nav({ to: isRegistered ? "/candidate/dashboard" : "/candidate/register" });
    } catch (err: any) {
      setError(err.message || "OTP verification failed. Please check both codes.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 py-8">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-sm p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-full bg-[#6C63FF]/10 flex items-center justify-center mb-4">
            <ShieldCheck className="h-7 w-7 text-[#6C63FF]" />
          </div>
          <h1 className="text-2xl font-bold">Two-step verification</h1>
          <p className="text-sm text-muted-foreground mt-2">Enter both OTPs sent to your email and phone.</p>
        </div>

        <Section icon={<Mail className="h-4 w-4" />} title="Email OTP" subtitle={email ? `Sent to ${email.slice(0,2)}***@${email.split("@")[1]}` : "Sent to your college email"}>
          <OtpInput value={emailOtp} onChange={setEmailOtp} />
          <p className="text-xs text-muted-foreground text-center mt-2">Expires in <Countdown seconds={10 * 60} /></p>
        </Section>

        <div className="my-6 border-t border-border" />

        <Section icon={<Phone className="h-4 w-4" />} title="Phone OTP" subtitle={mobile ? `Sent to +91-XXXXXX${mobile.slice(-4)}` : "Sent via SMS"}>
          <OtpInput value={phoneOtp} onChange={setPhoneOtp} />
          <p className="text-xs text-muted-foreground text-center mt-2">Expires in <Countdown seconds={10 * 60} /></p>
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
          className="w-full mt-7 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Verifying...
            </span>
          ) : "Verify Both & Continue"}
        </Button>

        <button
          onClick={() => nav({ to: "/" })}
          className="w-full text-xs text-center text-muted-foreground hover:text-foreground mt-4 transition-colors"
        >
          ← Back to Login
        </button>
      </div>
    </div>
  );
}

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-foreground/70">{icon}</div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
