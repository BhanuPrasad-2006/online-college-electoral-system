import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Eye, EyeOff, Shield, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { adminLoginStep1, saveOtpSession } from "@/lib/api";
import { toast } from "sonner";
import { SSRRecaptcha } from "@/components/SSRRecaptcha";

export const Route = createFileRoute("/admin/login")({ component: AdminLogin });

function AdminLogin() {
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const recaptchaRef = useRef<any>(null);

  return (
    <div className="dark min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-dark to-secondary-dark p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-20 left-20 w-64 h-64 bg-[#0F8A5F] rounded-full blur-3xl animate-pulse-subtle" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-[#16A34A] rounded-full blur-3xl" />
      </div>
      <div
        className="relative w-full max-w-md dark-glass-panel rounded-[24px] border border-white/10 shadow-2xl p-8 animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#0F8A5F] to-[#16A34A] flex items-center justify-center mb-4 shadow-lg shadow-[#0F8A5F]/20">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Election Administration Portal</h1>
          <p className="text-sm text-sidebar-foreground/60 mt-1 font-medium">
            Restricted access — committee members only
          </p>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              if (!captchaToken) {
                throw new Error("Please complete CAPTCHA verification.");
              }
              const mobileNum = mobile.replace(/\s/g, "");
              const res = await adminLoginStep1(email, mobileNum, password, captchaToken);
              saveOtpSession(res.otp_session_token, email, mobileNum);
              toast.success(res.hint);
              nav({ to: "/admin/otp-verify" });
            } catch (err: any) {
              toast.error(err.message || "Invalid credentials.");
              setLoading(false);
              recaptchaRef.current?.reset();
              setCaptchaToken(null);
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-semibold text-sidebar-foreground/75 uppercase tracking-wide">
              College Email
            </label>
            <Input
              type="email"
              required
              placeholder="admin@college.edu.in"
              className="mt-1.5 h-11 bg-white/5 border-white/10 text-white rounded-xl focus:border-[#0F8A5F]/60"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-sidebar-foreground/75 uppercase tracking-wide">
              Phone Number
            </label>
            <div className="mt-1.5 flex">
              <span className="inline-flex items-center px-3 border border-r-0 border-white/10 bg-white/5 rounded-l-xl text-sm font-medium text-sidebar-foreground/60">
                +91
              </span>
              <Input
                type="tel"
                required
                placeholder="98765 43210"
                className="rounded-l-none h-11 bg-white/5 border-white/10 text-white rounded-r-xl focus:border-[#0F8A5F]/60"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-sidebar-foreground/75 uppercase tracking-wide">
              Password
            </label>
            <div className="mt-1.5 relative">
              <Input
                type={show ? "text" : "password"}
                required
                className="pr-10 h-11 bg-white/5 border-white/10 text-white rounded-xl focus:border-[#0F8A5F]/60"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/60 hover:text-white transition-colors"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <SSRRecaptcha
            recaptchaRef={recaptchaRef}
            onChange={(token) => setCaptchaToken(token)}
            onExpired={() => setCaptchaToken(null)}
          />
          <Button
            type="submit"
            disabled={loading || !email || !mobile || !password || !captchaToken}
            className="w-full h-11 bg-gradient-to-r from-[#0F8A5F] to-[#16A34A] text-white hover:opacity-95 border-0 shadow-lg rounded-xl font-bold mt-2 shadow-[#0F8A5F]/20 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Signing in...
              </span>
            ) : (
              "Login Securely"
            )}
          </Button>
        </form>
        <p className="text-[11px] text-center text-sidebar-foreground/50 mt-6 flex items-center justify-center gap-1.5 font-medium">
          <ShieldCheck className="h-4 w-4 text-[#16A34A]" />
          Access restricted to election committee members only
        </p>
      </div>
    </div>
  );
}
