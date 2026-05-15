import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Shield, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/adminlogin")({ component: AdminLogin });

function AdminLogin() {
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1C2E] p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-64 h-64 bg-[#6C63FF] rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-[#1F3A6E] rounded-full blur-3xl animate-float" />
      </div>
      <div
        className="relative w-full max-w-md glass-panel rounded-2xl border border-white/10 shadow-2xl p-8 animate-fade-in-up bg-card/95"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#1F3A6E] to-[#6C63FF] flex items-center justify-center mb-4 shadow-lg shadow-[#6C63FF]/25 animate-pulse-glow">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Election Administration Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Restricted access — committee members only</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setLoading(true);
            setTimeout(() => {
              setLoading(false);
              nav({ to: "/admin-otp-verify" });
            }, 500);
          }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">College Email</label>
            <Input type="email" required placeholder="admin@college.edu.in" className="mt-1.5 h-11" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone Number</label>
            <div className="mt-1.5 flex">
              <span className="inline-flex items-center px-3 border border-r-0 border-border bg-muted rounded-l-md text-sm font-medium">+91</span>
              <Input type="tel" required placeholder="98765 43210" className="rounded-l-none h-11" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Password</label>
            <div className="mt-1.5 relative">
              <Input type={show ? "text" : "password"} required className="pr-10 h-11" />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white hover:opacity-95 border-0 shadow-lg btn-shine"
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
        <p className="text-[11px] text-center text-muted-foreground mt-6 flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[#6C63FF]" />
          Access restricted to election committee members only
        </p>
      </div>
    </div>
  );
}
