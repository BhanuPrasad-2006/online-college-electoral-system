import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Phone, ShieldCheck } from "lucide-react";
import { OtpInput } from "@/components/OtpInput";
import { Countdown } from "@/components/Countdown";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export const Route = createFileRoute("/candidate-otp-verify")({ component: Page });

function Page() {
  const nav = useNavigate();
  const { login, candidateRegistered } = useAuth();
  const [emailOtp, setEmailOtp] = useState(Array(6).fill(""));
  const [phoneOtp, setPhoneOtp] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const ready = emailOtp.every((d) => d) && phoneOtp.every((d) => d);

  function verify() {
    setLoading(true);
    setTimeout(() => {
      login("candidate");
      toast.success("Both OTPs verified");
      nav({ to: candidateRegistered ? "/candidate/dashboard" : "/candidate/register" });
    }, 600);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 py-8">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-sm p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-full bg-[#6C63FF]/10 flex items-center justify-center mb-4">
            <ShieldCheck className="h-7 w-7 text-[#6C63FF]" />
          </div>
          <h1 className="text-2xl font-bold">Two-step verification</h1>
          <p className="text-sm text-muted-foreground mt-2">Enter both OTPs to continue.</p>
        </div>

        <Section icon={<Mail className="h-4 w-4" />} title="Email OTP" subtitle="Sent to your college email">
          <OtpInput value={emailOtp} onChange={setEmailOtp} />
          <p className="text-xs text-muted-foreground text-center mt-2">Expires in <Countdown seconds={10 * 60} /></p>
        </Section>

        <div className="my-6 border-t border-border" />

        <Section icon={<Phone className="h-4 w-4" />} title="Phone OTP" subtitle="Sent to +91-XXXXXX1234">
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
