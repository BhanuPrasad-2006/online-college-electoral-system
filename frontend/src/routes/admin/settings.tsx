import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  requestPasswordChange,
  confirmPasswordChange,
  fetchAdminUsers,
  createAdminUser,
  deleteAdminUser,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ShieldCheck, Mail, KeyRound, X, Shield, Trash2, UserPlus, Loader2 } from "lucide-react";
import { ReconfirmPasswordModal } from "@/components/ReconfirmPasswordModal";

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

function formatRole(role: string | null) {
  if (!role) return "Admin";
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function Page() {
  const jwtPayload = useMemo(() => decodeJwtPayload(), []);
  const { adminRole } = useAuth();
  const isSuperAdmin = adminRole === "SUPER_ADMIN";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpSessionToken, setOtpSessionToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [hint, setHint] = useState("");

  // Admin Manager States
  const [admins, setAdmins] = useState<any[]>([]);
  const [fetchingAdmins, setFetchingAdmins] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("CANDIDATE_MODERATOR");
  const [newPasswordVal, setNewPasswordVal] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [reconfirmOpen, setReconfirmOpen] = useState(false);
  const [reconfirmAction, setReconfirmAction] = useState<"create_admin" | "delete_admin" | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    if (!isSuperAdmin) return;
    setFetchingAdmins(true);
    try {
      const list = await fetchAdminUsers();
      setAdmins(list);
    } catch (err: any) {
      toast.error(err.message || "Failed to load admin accounts");
    } finally {
      setFetchingAdmins(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadAdmins();
    }
  }, [isSuperAdmin, loadAdmins]);

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

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPasswordVal.trim() || !newRole) {
      toast.error("Please fill in all fields for the new admin account.");
      return;
    }

    setCreatingAdmin(true);
    try {
      await createAdminUser({
        full_name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        password: newPasswordVal.trim(),
      });
      toast.success("Admin account created successfully!");
      setNewName("");
      setNewEmail("");
      setNewPasswordVal("");
      loadAdmins();
    } catch (err: any) {
      toast.error(err.message || "Failed to create admin account.");
    } finally {
      setCreatingAdmin(false);
    }
  }

  async function handleDeleteAdmin(adminId: string) {
    if (!confirm("Are you sure you want to delete this admin account?")) return;
    try {
      await deleteAdminUser(adminId);
      toast.success("Admin account deleted successfully.");
      loadAdmins();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete admin account.");
    }
  }

  return (
    <div className="space-y-6 max-w-4xl relative">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your admin account and preferences.</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-5 w-5 text-[#0F8A5F]" />
          <h2 className="text-base font-semibold">Account</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Full Name</label>
            <Input className="mt-1 h-11 bg-muted/40 cursor-not-allowed" value={jwtPayload.name || "Administrator"} disabled readOnly />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Role</label>
            <Input className="mt-1 h-11 bg-muted/40 cursor-not-allowed" value={formatRole(adminRole)} disabled readOnly />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Email</label>
            <Input className="mt-1 h-11 bg-muted/40 cursor-not-allowed" value={jwtPayload.email || "admin@college.edu.in"} disabled readOnly />
          </div>
        </div>
      </div>

      <form onSubmit={handlePasswordChangeRequest} className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[#0F8A5F]" />
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
          <Button type="submit" disabled={loading} className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 h-11 px-6 shadow-md">
            {loading ? "Processing..." : "Update Password"}
          </Button>
        </div>
      </form>

      {/* Admin User Manager Module (Super Admin Only) */}
      {isSuperAdmin && (
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-6">
          <div className="flex items-center gap-2 border-b pb-3">
            <UserPlus className="h-5 w-5 text-[#0F8A5F]" />
            <h2 className="text-base font-semibold">Admin User Manager (Super Admin Only)</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create Admin Form */}
            <form onSubmit={handleCreateAdmin} className="space-y-4 lg:col-span-1 border-r border-border/60 pr-0 lg:pr-6">
              <h3 className="text-sm font-semibold text-foreground/80">Create New Admin Account</h3>
              
              <div>
                <label className="text-xs text-muted-foreground">Full Name</label>
                <Input
                  className="mt-1"
                  placeholder="e.g. John Doe"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <Input
                  className="mt-1"
                  type="email"
                  placeholder="name@college.edu.in"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Password</label>
                <Input
                  className="mt-1"
                  type="password"
                  placeholder="••••••••"
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Admin Role</label>
                <select
                  className="w-full mt-1 h-10 px-3 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="SUPER_ADMIN">Super Admin</option>
                  <option value="ELECTION_MANAGER">Election Manager</option>
                  <option value="CANDIDATE_MODERATOR">Candidate Moderator</option>
                  <option value="AUDIT_SECURITY_ADMIN">Audit & Security Admin</option>
                </select>
              </div>

              <Button
                type="button"
                disabled={creatingAdmin}
                className="w-full bg-[#0F8A5F] hover:bg-[#0F8A5F]/90 text-white h-10 shadow-sm"
                onClick={() => {
                  if (!newName.trim() || !newEmail.trim() || !newPasswordVal.trim() || !newRole) {
                    toast.error("Please fill in all fields for the new admin account.");
                    return;
                  }
                  setReconfirmAction("create_admin");
                  setReconfirmOpen(true);
                }}
              >
                {creatingAdmin ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Admin"
                )}
              </Button>
            </form>

            {/* List Admins */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground/80">Active Admin Accounts</h3>
                {fetchingAdmins && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
              </div>

              <div className="border border-border/60 rounded-xl overflow-hidden bg-muted/10 max-h-[360px] overflow-y-auto">
                {admins.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No other admin accounts found.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {admins.map((adm) => {
                      const isSelf = adm.email.toLowerCase() === jwtPayload.email?.toLowerCase();
                      return (
                        <div key={adm.admin_id} className="p-4 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors">
                          <div>
                            <p className="font-semibold text-sm">{adm.full_name} {isSelf && <span className="text-xs text-blue-500 font-normal">(You)</span>}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{adm.email}</p>
                            <span className="inline-block bg-[#D9A441]/10 text-[#D9A441] text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1">
                              {formatRole(adm.role)}
                            </span>
                          </div>
                          {!isSelf && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDeleteTargetId(adm.admin_id);
                                setReconfirmAction("delete_admin");
                                setReconfirmOpen(true);
                              }}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Password Reconfirmation Modal */}
      <ReconfirmPasswordModal
        open={reconfirmOpen}
        onOpenChange={(o) => { setReconfirmOpen(o); if (!o) { setReconfirmAction(null); setDeleteTargetId(null); } }}
        title={reconfirmAction === "create_admin" ? "Create Admin Account" : "Delete Admin Account"}
        description={reconfirmAction === "create_admin"
          ? "Creating a new admin account is a sensitive action. Please confirm your password to proceed."
          : "Deleting an admin account is a sensitive action. Please confirm your password to proceed."
        }
        actionLabel={reconfirmAction === "create_admin" ? "Confirm & Create" : "Confirm & Delete"}
        onVerified={async () => {
          if (reconfirmAction === "create_admin") {
            await handleCreateAdmin(new Event("submit") as any);
          } else if (reconfirmAction === "delete_admin" && deleteTargetId) {
            await handleDeleteAdmin(deleteTargetId);
          }
          setReconfirmAction(null);
          setDeleteTargetId(null);
        }}
      />

      {otpModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border/60 overflow-hidden relative animate-scale-up">
            <div className="p-6 pb-0 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#0F8A5F]/15 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-[#0F8A5F]" />
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
              <Button type="submit" disabled={otpLoading || otpCode.length < 4} className="w-full h-12 bg-[#0F8A5F] hover:bg-[#0F8A5F]/90 text-white font-semibold shadow-md">
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
