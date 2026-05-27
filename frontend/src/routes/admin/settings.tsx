import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { requestPasswordChange, confirmPasswordChange } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, Mail, KeyRound, X, Shield } from "lucide-react";

function decodeJwtPayload(): { email?: string; name?: string; sub?: string } {
  try {
    const token = sessionStorage.getItem("collegevote-token");
    if (!token) return {};
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return {};
    return JSON.parse(window.atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

function Page() {
  const jwtPayload = useMemo(() => decodeJwtPayload(), []);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpSessionToken, setOtpSessionToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [hint, setHint] = useState("");

  async function handlePasswordChangeRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    try {
      const res = await requestPasswordChange(currentPassword, newPassword);
      setOtpSessionToken(res.otp_session_token);
      setHint(res.hint || "An OTP has been sent to your email.");
      toast.success(res.hint || "Password reset request sent successfully.");
      setOtpModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to request password change.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!otpCode || otpCode.length < 4) {
      toast.error("Please enter a valid OTP code.");
      return;
    }

    setOtpLoading(true);
    try {
      const res = await confirmPasswordChange(otpSessionToken, otpCode);
      toast.success(res.message || "Password changed successfully!");
      setOtpModalOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOtpCode("");
    } catch (err: any) {
      toast.error(err.message || "OTP verification failed. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl relative">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your admin account and preferences.</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-5 w-5 text-[#6C63FF]" />
          <h2 className="text-base font-semibold">Account</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Full Name</label>
            <Input className="mt-1 h-11 bg-muted/40 cursor-not-allowed" value={jwtPayload.name || "Administrator"} disabled readOnly />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Role</label>
            <Input className="mt-1 h-11 bg-muted/40 cursor-not-allowed" value="Admin" disabled readOnly />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Email</label>
            <Input className="mt-1 h-11 bg-muted/40 cursor-not-allowed" value={jwtPayload.email || "admin@college.edu"} disabled readOnly />
          </div>
        </div>
      </div>

      <form onSubmit={handlePasswordChangeRequest} className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[#6C63FF]" />
          <h2 className="text-base font-semibold">Change Password</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Current Password</label>
            <Input className="mt-1 h-11" type="password" placeholder="••••••••" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="hidden sm:block" />
          <div>
            <label className="text-xs text-muted-foreground">New Password</label>
            <Input className="mt-1 h-11" type="password" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Confirm New Password</label>
            <Input className="mt-1 h-11" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={loading} className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90 h-11 px-6 shadow-md">
            {loading ? "Processing..." : "Update Password"}
          </Button>
        </div>
      </form>

      <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
        <h2 className="text-base font-semibold">Notifications</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {["Email alerts", "SMS alerts", "Election announcements"].map((l) => (
            <div key={l} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
              <span className="text-sm font-medium">{l}</span>
              <Switch defaultChecked />
            </div>
          ))}
        </div>
      </div>

      {otpModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border/60 overflow-hidden relative animate-scale-up">
            <div className="p-6 pb-0 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#6C63FF]/15 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-[#6C63FF]" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Verify Your Identity</h3>
                  <p className="text-xs text-muted-foreground">Verification code is required</p>
                </div>
              </div>
              <button onClick={() => setOtpModalOpen(false)} className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted/60 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleOtpVerification} className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-3.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
                <Mail className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed font-medium">
                  {hint || "A 6-digit OTP code has been sent to your registered email."}
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">6-Digit Email OTP</label>
                <Input
                  className="mt-2 h-12 text-center text-xl font-bold tracking-[0.4em] bg-muted/40"
                  placeholder="000000"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>
              <Button type="submit" disabled={otpLoading || otpCode.length < 4} className="w-full h-12 bg-[#6C63FF] hover:bg-[#5A52D5] text-white font-semibold shadow-md">
                {otpLoading ? "Verifying..." : "Verify & Update Password"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/admin/settings")({
  component: Page,
});
