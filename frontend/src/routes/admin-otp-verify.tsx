import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Phone, ShieldCheck } from "lucide-react";
import { OtpInput } from "@/components/OtpInput";
import { Countdown } from "@/components/Countdown";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-otp-verify")({ component: Page });

function Page() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [emailOtp, setEmailOtp] = useState(Array(6).fill(""));
  const [phoneOtp, setPhoneOtp] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const ready = emailOtp.every((d) => d) && phoneOtp.every((d) => d);

  function verify() {
    setLoading(true);
    setTimeout(() => {
      login("admin");
      toast.success("Admin verified");
      nav({ to: "/admin/dashboard" });
    }, 600);
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

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Mail className="h-4 w-4" />
            <p className="text-sm font-semibold">Email OTP</p>
          </div>
          <OtpInput value={emailOtp} onChange={setEmailOtp} />
          <p className="text-xs text-muted-foreground text-center mt-2">Expires in <Countdown seconds={10 * 60} /></p>
        </div>

        <div className="my-6 border-t border-border" />

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Phone className="h-4 w-4" />
            <p className="text-sm font-semibold">Phone OTP</p>
          </div>
          <OtpInput value={phoneOtp} onChange={setPhoneOtp} />
          <p className="text-xs text-muted-foreground text-center mt-2">Expires in <Countdown seconds={10 * 60} /></p>
        </div>

        <Button onClick={verify} disabled={!ready || loading} className="w-full mt-7 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90">
          {loading ? "Verifying..." : "Verify Both & Continue"}
        </Button>
      </div>
    </div>
  );
}
