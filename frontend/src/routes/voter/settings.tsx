import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageLoader } from "@/components/PageLoader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useVoterProfile } from "@/hooks/use-election-data";
import { requestPasswordChange, confirmPasswordChange, uploadVoterOwnPhoto, resolveApiAssetUrl, resolveVoterPhotoUrl } from "@/lib/api";
import { toast } from "sonner";
import Webcam from "react-webcam";
import { ShieldCheck, Mail, KeyRound, Camera, Upload, AlertTriangle, Clock, CheckCircle2, AlertCircle, X, Video } from "lucide-react";

function Page() {
  const { data: voter, isPending } = useVoterProfile();
  const queryClient = useQueryClient();

  // State for password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // OTP Modal state
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpSessionToken, setOtpSessionToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [hint, setHint] = useState("");

  // Photo upload state
  const [photoMode, setPhotoMode] = useState<"file" | "webcam" | null>(null);
  const [webcamReady, setWebcamReady] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const webcamRef = useRef<Webcam>(null);

  const handleCaptureSelfie = useCallback(async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      toast.error("Failed to capture photo. Make sure your camera is working.");
      return;
    }
    // Convert base64 data URL to File
    const arr = imageSrc.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
    const file = new File([u8arr], "selfie.jpg", { type: mime });

    setIsUploading(true);
    try {
      const result = await uploadVoterOwnPhoto(file);
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ["voter-profile"] });
      setPhotoMode(null);
      setWebcamReady(false);
      setWebcamError(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setIsUploading(false);
    }
  }, [queryClient]);

  if (isPending || !voter) return <PageLoader />;

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
      setHint(res.hint);
      toast.success(res.hint);
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

      // Clear forms
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
        <p className="text-sm text-muted-foreground mt-1">Manage your profile and preferences.</p>
      </div>

      {/* Account Info */}
      <div className="bg-card rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold">Account Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name" value={voter.name} disabled />
          <Field label="Email" value={(voter as any).email || "—"} disabled />
          <Field label="Department" value={voter.department} disabled />
          <Field label="Year" value={voter.year} disabled />
        </div>
      </div>

{/* ── Profile Photo Section ── */}
      <div className="bg-card rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-[#0F8A5F]" />
          <h2 className="text-base font-semibold">Profile Photo</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Your photo is used for face verification during voting. You can upload a new photo here — it will be reviewed by the election admin before being approved.
        </p>

        <div className="bg-card border border-border/60 rounded-xl p-4 flex items-start gap-4">
          {/* Photo display */}
          <div className="flex flex-col items-center shrink-0">
            {voter.reference_image_url ? (
              <div className="relative">
                <Avatar className="h-20 w-20 ring-2 ring-[#0F8A5F]/30 rounded-xl">
                  <AvatarImage
                    src={resolveVoterPhotoUrl(voter.voter_id)}
                    alt="Profile photo"
                    className="object-cover rounded-xl"
                  />
                  <AvatarFallback className="bg-muted rounded-xl">
                    <Camera className="h-6 w-6 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                {voter.face_enrolled && (
                  <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success border-2 border-card flex items-center justify-center">
                    <CheckCircle2 className="h-3 w-3 text-white" />
                  </span>
                )}
              </div>
            ) : (
              <div className="h-20 w-20 shrink-0 rounded-xl bg-warning/15 flex items-center justify-center ring-2 ring-warning/20">
                <AlertTriangle className="h-8 w-8 text-warning" />
              </div>
            )}
            {voter.photo_reupload_count !== undefined && (
              <span className="text-[10px] text-muted-foreground mt-1.5 font-medium">
                {voter.photo_reupload_count}/2 re-uploads used
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {voter.pending_face_enrolled ? (
              <>
                <p className="text-sm font-semibold text-warning-foreground flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-warning" />
                  Photo Pending Admin Review
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your uploaded photo is awaiting approval. Once approved, it will replace your current photo.
                </p>
              </>
            ) : voter.face_enrolled ? (
              <>
                <p className="text-sm font-semibold text-success flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Photo Verified
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your profile photo is enrolled for face verification during voting.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-warning-foreground">
                  No Photo Enrolled
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upload a clear, well-lit photo of your face below.
                </p>
              </>
            )}
          </div>

          {/* Upload controls */}
          {(voter.photo_reupload_count || 0) < 2 && !voter.pending_face_enrolled ? (
            <div className="shrink-0 flex flex-col items-center gap-1.5">
              <button
                onClick={() => { setPhotoMode("webcam"); setWebcamReady(false); setWebcamError(null); }}
                className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${voter.photo_reupload_requested ? "bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 shadow-sm font-semibold" : "bg-[#D9A441]/10 text-[#D9A441] hover:bg-[#0F8A5F]/20"}`}
              >
                <Video className="h-3.5 w-3.5" />
                {voter.photo_reupload_requested ? "Take New Selfie" : "Take Selfie"}
              </button>
              <label
                htmlFor="settings-face-upload"
                className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 text-muted-foreground hover:bg-muted transition-colors text-xs font-medium"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload File
              </label>
              <input
                id="settings-face-upload"
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsUploading(true);
                  try {
                    const result = await uploadVoterOwnPhoto(file);
                    toast.success(result.message);
                    queryClient.invalidateQueries({ queryKey: ["voter-profile"] });
                  } catch (err: any) {
                    toast.error(err.message || "Failed to upload photo");
                  } finally {
                    setIsUploading(false);
                  }
                  e.target.value = "";
                }}
              />
            </div>
          ) : !voter.pending_face_enrolled ? (
            <div className="shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium cursor-not-allowed">
                <AlertCircle className="h-3.5 w-3.5" />
                Max Reached (2/2)
              </span>
            </div>
          ) : null}
        </div>

        {voter.photo_reupload_requested && !voter.pending_face_enrolled && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#0F8A5F]/10 border border-[#D9A441]/20">
            <Camera className="h-4 w-4 text-[#0F8A5F] shrink-0 mt-0.5" />
            <p className="text-xs text-[#0F8A5F] font-medium">
              The election admin has requested you to upload a new photo. Please take a selfie or upload a clear, well-lit photo of your face.
            </p>
          </div>
        )}

        {/* ── Webcam Capture Modal ── */}
        {photoMode === "webcam" && (
          <div className="border border-[#D9A441]/30 rounded-xl bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Video className="h-4 w-4 text-[#0F8A5F]" /> Live Selfie Capture
              </p>
              <button onClick={() => { setPhotoMode(null); setWebcamReady(false); setWebcamError(null); }}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Position your face in the center of the frame, ensure good lighting, and look directly at the camera. This photo will be used for face verification during voting.
            </p>
            <div className="rounded-xl overflow-hidden border-2 border-[#D9A441]/30 bg-muted/40 relative">
              <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-md z-10 flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                </span>
                Live
              </div>
              {webcamError ? (
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-destructive p-4 text-center">
                  <AlertTriangle className="h-7 w-7" />
                  <p className="text-xs font-medium">{webcamError}</p>
                  <Button size="sm" variant="outline" onClick={() => { setWebcamError(null); setWebcamReady(false); }}>Retry</Button>
                </div>
              ) : (
                <>
                  {!webcamReady && (
                    <div className="h-48 flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <div className="animate-spin h-5 w-5 border-2 border-[#0F8A5F] border-t-transparent rounded-full mx-auto" />
                        <p className="text-xs text-muted-foreground">Starting camera...</p>
                      </div>
                    </div>
                  )}
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    screenshotQuality={0.95}
                    videoConstraints={{ facingMode: "user", width: 640, height: 480 }}
                    className={`w-full h-auto max-h-[260px] object-cover ${webcamReady ? "" : "hidden"}`}
                    onUserMedia={() => setWebcamReady(true)}
                    onUserMediaError={() => setWebcamError("Camera access denied. Please allow camera access in your browser settings.")}
                  />
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1"
                onClick={() => { setPhotoMode(null); setWebcamReady(false); setWebcamError(null); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90"
                disabled={!webcamReady || !!webcamError || isUploading}
                onClick={handleCaptureSelfie}
              >
                {isUploading ? "Uploading..." : <><Camera className="h-3.5 w-3.5 mr-1" /> Capture & Submit</>}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Change Password Form */}
      <form
        onSubmit={handlePasswordChangeRequest}
        className="bg-card rounded-2xl shadow-sm p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[#0F8A5F]" />
          <h2 className="text-base font-semibold">Security & Password</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Current Password</label>
            <Input
              className="mt-1 h-11"
              type="password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="hidden sm:block" />

          <div>
            <label className="text-xs text-muted-foreground">New Password</label>
            <Input
              className="mt-1 h-11"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Confirm New Password</label>
            <Input
              className="mt-1 h-11"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={loading}
            className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 h-11 px-6 shadow-md"
          >
            {loading ? "Processing..." : "Update Password"}
          </Button>
        </div>
      </form>

      {/* Notification settings */}
      <div className="bg-card rounded-2xl shadow-sm p-6 space-y-4">
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

      {/* ── OTP Verification Modal Popup ── */}
      {otpModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border/60 overflow-hidden relative animate-scale-up">
            {/* Modal Header */}
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
              <button
                onClick={() => setOtpModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted/60 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleOtpVerification} className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-3.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
                <Mail className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed font-medium">
                  {hint || "A 6-digit OTP code has been sent to your registered college email."}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  6-Digit Email OTP
                </label>
                <Input
                  className="mt-2 h-12 text-center text-xl font-bold tracking-[0.4em] bg-muted/40 focus:bg-card focus:ring-[#0F8A5F] border-border"
                  placeholder="000000"
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOtpModalOpen(false)}
                  className="flex-1 h-11 border-border"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={otpLoading}
                  className="flex-1 h-11 bg-gradient-to-r from-[#1F2937] to-[#0F8A5F] text-white hover:opacity-95"
                >
                  {otpLoading ? "Verifying..." : "Confirm & Update"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  type = "text",
  disabled = false,
}: {
  label: string;
  value?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        className="mt-1 h-11 bg-muted/40 cursor-not-allowed"
        defaultValue={value}
        type={type}
        disabled={disabled}
      />
    </div>
  );
}

export const Route = createFileRoute("/voter/settings")({ component: Page });
