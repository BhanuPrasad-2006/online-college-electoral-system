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
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
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
    <div className="min-h-screen flex items-center justify-center premium-bg p-4 py-8">
      <div className="w-full max-w-md glass-panel rounded-[24px] shadow-2xl p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-full bg-[#0F8A5F]/10 flex items-center justify-center mb-4 ring-4 ring-[#0F8A5F]/5">
            <ShieldCheck className="h-7 w-7 text-[#0F8A5F]" />
          </div>
          <h1 className="text-2xl font-bold text-[#102A27]">Admin verification</h1>
          <p className="text-sm text-muted-foreground mt-2 font-medium">Two OTPs are required.</p>
        </div>

        {error && <p className="text-red-500 text-sm text-center mb-4 font-semibold">{error}</p>}

        <Section
          icon={<Mail className="h-4 w-4 text-[#0F8A5F]" />}
          title="Email OTP"
          subtitle={
            email
              ? `Sent to ${email.slice(0, 2)}***@${email.split("@")[1]}`
              : "Sent to your committee email"
          }
        >
          <OtpInput value={emailOtp} onChange={setEmailOtp} />
          <p className="text-xs text-muted-foreground text-center mt-2 font-medium">
            Expires in <span className="text-[#D97706] font-bold"><Countdown seconds={5 * 60} /></span>
          </p>
        </Section>

        <div className="my-6 border-t border-[#E6ECE9]" />

        <Section
          icon={<Phone className="h-4 w-4 text-[#0F8A5F]" />}
          title="Phone OTP"
          subtitle={mobile ? `Sent to +91-XXXXXX${mobile.slice(-4)}` : "Sent via secure SMS"}
        >
          <OtpInput value={phoneOtp} onChange={setPhoneOtp} />
          <p className="text-xs text-muted-foreground text-center mt-2 font-medium">
            Expires in <span className="text-[#D97706] font-bold"><Countdown seconds={5 * 60} /></span>
          </p>
        </Section>

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
      </div>
    </div>
  );
}
