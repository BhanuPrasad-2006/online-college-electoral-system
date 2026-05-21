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
      saveAuth(res.access_token, res.role, res.user_id, res.full_name);
      login("admin");
      toast.success("Identity verified securely!");
      nav({ to: "/admin/dashboard" });
    } catch (err: any) {
      setError(err.message || "OTP verification failed. Please check both codes.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1C2E] p-4 py-8">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-full bg-[#6C63FF]/10 flex items-center justify-center mb-4">
            <ShieldCheck className="h-7 w-7 text-[#6C63FF]" />
          </div>
          <h1 className="text-2xl font-bold">Admin verification</h1>
          <p className="text-sm text-muted-foreground mt-2">Two OTPs are required.</p>
        </div>

        {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}

        <Section icon={<Mail className="h-4 w-4" />} title="Email OTP" subtitle={email ? `Sent to ${email.slice(0,2)}***@${email.split("@")[1]}` : "Sent to your committee email"}>
          <OtpInput value={emailOtp} onChange={setEmailOtp} />
          <p className="text-xs text-muted-foreground text-center mt-2">Expires in <Countdown seconds={10 * 60} /></p>
        </Section>

        <div className="my-6 border-t border-border" />

        <Section icon={<Phone className="h-4 w-4" />} title="Phone OTP" subtitle={mobile ? `Sent to +91-XXXXXX${mobile.slice(-4)}` : "Sent via secure SMS"}>
          <OtpInput value={phoneOtp} onChange={setPhoneOtp} />
          <p className="text-xs text-muted-foreground text-center mt-2">Expires in <Countdown seconds={10 * 60} /></p>
        </Section>

        <Button onClick={verify} disabled={!ready || loading} className="w-full mt-7 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90">
          {loading ? "Verifying..." : "Verify Both & Continue"}
        </Button>
      </div>
    </div>
  );
}
