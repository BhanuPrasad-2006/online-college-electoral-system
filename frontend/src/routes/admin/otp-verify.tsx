import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Mail, Phone, ShieldCheck } from "lucide-react";
import { OtpInput } from "@/components/OtpInput";
import { Countdown } from "@/components/Countdown";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { adminLoginStep2, getOtpSession, saveAuth } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/otp-verify")({ component: AdminOtpVerify });

function Section({ icon, title, subtitle, children }: any) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-sidebar-foreground/60">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function AdminOtpVerify() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [emailOtp, setEmailOtp] = useState(Array(6).fill(""));
  const [phoneOtp, setPhoneOtp] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ready = emailOtp.every((d) => d) && phoneOtp.every((d) => d);
  const { sessionToken, email, mobile } = getOtpSession();

  useEffect(() => {
    if (!sessionToken) nav({ to: "/" });
  }, [sessionToken, nav]);

  async function verify() {
    if (!ready) return;
    setError("");
    setLoading(true);
    try {
      const emailOtpStr = emailOtp.join("");
      const phoneOtpStr = phoneOtp.join("");
      const res = await adminLoginStep2(sessionToken, emailOtpStr, phoneOtpStr);
      saveAuth(
        res.access_token,
        res.role,
        res.user_id,
        res.full_name,
        undefined,
        undefined,
        (res as any).csrf_token,
      );
      login("admin");
      toast.success("Identity verified securely!");
      nav({ to: "/admin/dashboard" });
    } catch (err: any) {
      setError(err.message || "OTP verification failed. Please check both codes.");
      setLoading(false);
    }
  }

  return (
  return (
    <div className="dark min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-dark to-secondary-dark p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-20 left-20 w-64 h-64 bg-[#0F8A5F] rounded-full blur-3xl animate-pulse-subtle" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-[#16A34A] rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md dark-glass-panel rounded-[24px] border border-white/10 shadow-2xl p-8 animate-fade-in-up">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#0F8A5F] to-[#16A34A] flex items-center justify-center mb-4 shadow-lg shadow-[#0F8A5F]/20">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin verification</h1>
          <p className="text-sm text-sidebar-foreground/60 mt-2 font-medium">Two OTPs are required.</p>
        </div>

        {error && <p className="text-red-500 text-sm text-center mb-4 font-semibold">{error}</p>}

        <Section
          icon={<Mail className="h-4 w-4 text-[#16A34A]" />}
          title="Email OTP"
          subtitle={
            email
              ? `Sent to ${email.slice(0, 2)}***@${email.split("@")[1]}`
              : "Sent to your committee email"
          }
        >
          <OtpInput value={emailOtp} onChange={setEmailOtp} />
          <p className="text-xs text-sidebar-foreground/60 text-center mt-2 font-medium">
            Expires in <span className="text-[#D97706] font-bold"><Countdown seconds={5 * 60} /></span>
          </p>
        </Section>

        <div className="my-6 border-t border-white/10" />

        <Section
          icon={<Phone className="h-4 w-4 text-[#16A34A]" />}
          title="Phone OTP"
          subtitle={mobile ? `Sent to +91-XXXXXX${mobile.slice(-4)}` : "Sent via secure SMS"}
        >
          <OtpInput value={phoneOtp} onChange={setPhoneOtp} />
          <p className="text-xs text-sidebar-foreground/60 text-center mt-2 font-medium">
            Expires in <span className="text-[#D97706] font-bold"><Countdown seconds={5 * 60} /></span>
          </p>
        </Section>

        <Button
          onClick={verify}
          disabled={!ready || loading}
          className="w-full mt-7 bg-gradient-to-r from-[#0F8A5F] to-[#16A34A] text-white hover:opacity-95 rounded-xl font-bold border-0 shadow-lg shadow-[#0F8A5F]/20 cursor-pointer"
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
      </div>
    </div>
  );
}
