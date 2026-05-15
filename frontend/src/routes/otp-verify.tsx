import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { OtpInput } from "@/components/OtpInput";
import { Countdown } from "@/components/Countdown";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export const Route = createFileRoute("/otp-verify")({ component: OtpVerify });

function OtpVerify() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [otp, setOtp] = useState(Array(6).fill(""));
  const [resendIn, setResendIn] = useState(60);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function complete() {
    setLoading(true);
    setTimeout(() => {
      login("voter");
      toast.success("Verified successfully");
      nav({ to: "/voter/dashboard" });
    }, 500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center mesh-bg p-4">
      <div
        className="w-full max-w-md glass-panel rounded-2xl border border-border/60 shadow-2xl p-8 animate-fade-in-up"
        style={{ animationDelay: "60ms" }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[#6C63FF]/20 to-[#1F3A6E]/20 flex items-center justify-center mb-4 ring-4 ring-[#6C63FF]/10 animate-pulse-glow">
            <Mail className="h-7 w-7 text-[#6C63FF]" />
          </div>
          <h1 className="text-2xl font-bold">Check your college email</h1>
          <p className="text-sm text-muted-foreground mt-2">
            A 6-digit OTP has been sent to <span className="font-semibold text-foreground">s*****@college.edu.in</span>
          </p>
        </div>
        <div className="mt-7">
          <OtpInput value={otp} onChange={setOtp} onComplete={complete} />
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4">
          OTP expires in <Countdown seconds={9 * 60 + 42} />
        </p>
        <Button
          variant="outline"
          disabled={resendIn > 0}
          onClick={() => setResendIn(60)}
          className="w-full mt-6 transition-all hover:border-[#6C63FF]/40"
        >
          {resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"}
        </Button>
        <Button
          onClick={complete}
          disabled={otp.some((d) => !d) || loading}
          className="w-full mt-3 bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white hover:opacity-95 border-0 shadow-lg btn-shine"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Verifying...
            </span>
          ) : (
            "Verify"
          )}
        </Button>
        <p className="text-xs text-center text-muted-foreground mt-6 flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[#6C63FF]" />
          Secured with end-to-end encryption
        </p>
      </div>
    </div>
  );
}
