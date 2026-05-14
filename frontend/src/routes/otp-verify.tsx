import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-sm p-8">
        <div className="flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-full bg-[#6C63FF]/10 flex items-center justify-center mb-4">
            <Mail className="h-7 w-7 text-[#6C63FF]" />
          </div>
          <h1 className="text-2xl font-bold">Check your college email</h1>
          <p className="text-sm text-muted-foreground mt-2">
            A 6-digit OTP has been sent to <span className="font-medium">s*****@college.edu.in</span>
          </p>
        </div>
        <div className="mt-7">
          <OtpInput value={otp} onChange={setOtp} onComplete={complete} />
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4">
          OTP expires in <Countdown seconds={9 * 60 + 42} />
        </p>
        <Button variant="outline" disabled={resendIn > 0} onClick={() => setResendIn(60)} className="w-full mt-6">
          {resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"}
        </Button>
        <Button onClick={complete} disabled={otp.some((d) => !d) || loading} className="w-full mt-3 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90">
          {loading ? "Verifying..." : "Verify"}
        </Button>
      </div>
    </div>
  );
}
