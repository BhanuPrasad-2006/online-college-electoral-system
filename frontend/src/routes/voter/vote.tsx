import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates, useVoterProfile, useCurrentPhase } from "@/hooks/use-election-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, X, ShieldCheck, Ban, Lock, Clock, RefreshCw, Check, ScanFace } from "lucide-react";
import { cn } from "@/lib/utils";
import { castVote, verifyVoterId, verifyFacePassive } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/voter/vote")({ component: VotePage });

// ── Passive capture constants ───────────────────────────────────
const TOTAL_FRAMES   = 8;      // increased from 5 — backend allows up to 8, more frames increase liveness pass rate
const FRAME_W        = 480;
const FRAME_H        = 640;
const JPEG_QUALITY   = 0.85;   // slightly higher quality for better liveness noise profile
const JITTER_MIN_MS  = 200;    // reduced from 350 — faster capture reduces user fatigue
const JITTER_MAX_MS  = 350;    // reduced from 500 — still random enough to prevent timing attacks

type PassiveState = "idle" | "detecting" | "capturing" | "submitting" | "success" | "failed";

const NOTA_ID = "nota";

function VotePage() {
  const nav = useNavigate();
  const { logout } = useAuth();
  const [step, setStep] = useState<"verification_id" | "ballot" | "confirm_vote" | "face_verification" | "success">("verification_id");
  const [txDetails, setTxDetails] = useState<{
    voteId: string;
    currentHash: string;
    electionName: string;
    timestamp: string;
  } | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [antiReplayToken, setAntiReplayToken] = useState<string>("");
  const [webcamReady, setWebcamReady] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  // ── Passive Liveness State ────────────────────────────────
  const [passiveState, setPassiveState] = useState<PassiveState>("idle");
  const [passiveError, setPassiveError] = useState("");
  const [capturedCount, setCapturedCount] = useState(0);   // 0–5 progress
  const [faceSessionToken, setFaceSessionToken] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false); // face centering status
  const [matchScore, setMatchScore] = useState<number | null>(null); // 0–100

  // face-api.js detection loop ref
  const detectionLoopRef = useRef<any>(null);
  const captureAbortRef  = useRef(false);                  // signals abort mid-capture
  const faceApiLoadedRef = useRef(false);
  const passiveStateRef  = useRef<PassiveState>("idle");

  // ── Honeypot (bot detection) fields ──────────────────────
  const [hpField1, setHpField1] = useState("");
  const [hpField2, setHpField2] = useState("");
  const [hpField3, setHpField3] = useState("");
  // Track when the review screen (with face capture) first renders
  const reviewStartRef = useRef<number>(0);

  const queryClient = useQueryClient();
  const webcamRef = useRef<Webcam>(null);

  const { data: candidates = [], isPending } = useCandidates();
  const { data: voter, isPending: isVoterPending } = useVoterProfile();
  const { data: effectivePhase } = useCurrentPhase();

  // ── Phase gate: redirect if voting is not open ────────────
  useEffect(() => {
    if (effectivePhase && effectivePhase.phase !== "voting_open") {
      toast.error("Voting is not currently open.");
      nav({ to: "/voter/dashboard" });
    }
  }, [effectivePhase, nav]);

  // ── Session Recovery & Receipt Restoration on Mount ──────────
  useEffect(() => {
    // 1. Check if there's a persistent success receipt (24h retention)
    const receiptStr = localStorage.getItem("collegevote-receipt");
    if (receiptStr) {
      try {
        const receipt = JSON.parse(receiptStr);
        if (receipt.expiresAt && Date.now() < receipt.expiresAt) {
          setTxDetails({
            voteId: receipt.voteId,
            currentHash: receipt.currentHash,
            electionName: receipt.electionName,
            timestamp: receipt.timestamp
          });
          setStep("success");
          return;
        } else {
          localStorage.removeItem("collegevote-receipt");
        }
      } catch (e) {
        console.error("Failed to parse receipt from localStorage", e);
      }
    }

    // 2. Check 5-minute session recovery — but ONLY restore progress
    //    if a verification session exists (prevents bypassing verification).
    const hasVerificationSession = sessionStorage.getItem("collegevote-verification-session") === "true";
    if (!hasVerificationSession) {
      // No verification session — clear any stale recovery data and start fresh
      clearRecoverySession();
      return;
    }

    const recoveryTsStr = sessionStorage.getItem("collegevote-recovery-timestamp");
    if (recoveryTsStr) {
      const ts = parseInt(recoveryTsStr, 10);
      if (Date.now() - ts < 5 * 60 * 1000) {
        const rSelected = sessionStorage.getItem("collegevote-recovery-selected");
        const rVerificationCode = sessionStorage.getItem("collegevote-recovery-verificationCode");
        const rAntiReplayToken = sessionStorage.getItem("collegevote-recovery-antiReplayToken");
        const rFaceSessionToken = sessionStorage.getItem("collegevote-recovery-faceSessionToken");
        const rStep = sessionStorage.getItem("collegevote-recovery-step");

        if (rVerificationCode) setVerificationCode(rVerificationCode);
        if (rAntiReplayToken) setAntiReplayToken(rAntiReplayToken);
        if (rSelected) setSelected(rSelected === "" ? null : rSelected);

        // SECURITY: Restore to confirm_vote or face_verification only.
        // "ballot" (candidate selection) is intentionally excluded — the user
        // must always pass through verification ID validation first.
        // faceSessionToken is also intentionally NOT restored — it may have
        // expired in the biometric token cache (120s TTL).
        if (rStep && ["confirm_vote", "face_verification"].includes(rStep)) {
          setStep(rStep as any);
        }
      } else {
        clearRecoverySession();
      }
    }
  }, []);

  const clearRecoverySession = () => {
    sessionStorage.removeItem("collegevote-recovery-timestamp");
    sessionStorage.removeItem("collegevote-recovery-selected");
    sessionStorage.removeItem("collegevote-recovery-verificationCode");
    sessionStorage.removeItem("collegevote-recovery-antiReplayToken");
    sessionStorage.removeItem("collegevote-recovery-faceSessionToken");
    sessionStorage.removeItem("collegevote-recovery-step");
    sessionStorage.removeItem("collegevote-verification-session");
  };

  // Sync recovery state to sessionStorage whenever it changes, if we are past the verification step
  useEffect(() => {
    if (step !== "verification_id" && step !== "success") {
      sessionStorage.setItem("collegevote-recovery-timestamp", Date.now().toString());
      sessionStorage.setItem("collegevote-recovery-selected", selected || "");
      sessionStorage.setItem("collegevote-recovery-verificationCode", verificationCode || "");
      sessionStorage.setItem("collegevote-recovery-antiReplayToken", antiReplayToken || "");
      sessionStorage.setItem("collegevote-recovery-faceSessionToken", faceSessionToken || "");
      sessionStorage.setItem("collegevote-recovery-step", step);
    }
  }, [step, selected, verificationCode, antiReplayToken, faceSessionToken]);

  const handleReturnToDashboard = () => {
    localStorage.removeItem("collegevote-receipt");
    clearRecoverySession();
    nav({ to: "/voter/dashboard" });
  };

  useEffect(() => {
    // JWT Session Timer
    if (step === "success") return;
    const token = sessionStorage.getItem("collegevote-token");
    if (!token) return;
    const jwtToken = token;

    function updateTimer() {
      try {
        const base64Url = jwtToken.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(window.atob(base64));
        const exp = payload.exp;
        if (!exp) return;

        const nowSec = Math.floor(Date.now() / 1000);
        const diff = exp - nowSec;

        if (diff <= 0) {
          setTimeLeft("Expired");
          logout();
          nav({ to: "/" });
          toast.error("Session expired. Please login again.");
        } else {
          const minutes = Math.floor(diff / 60);
          const seconds = diff % 60;
          setTimeLeft(`${minutes}m ${seconds}s`);
        }
      } catch (e) {
        console.error("Failed to decode token for timer", e);
      }
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [logout, nav, step]);

  if ((isPending || isVoterPending) && step === "verification_id") return <PageLoader />;

  if (step === "success") {
    if (!txDetails) {
      return <PageLoader />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 md:p-6 animate-in fade-in duration-300">
        <div className="max-w-lg w-full bg-card rounded-2xl shadow-lg border border-border p-8 md:p-10 space-y-6 text-center">
          
          <div className="mx-auto h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center animate-in zoom-in duration-500">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-fade-in" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground animate-in slide-in-from-top-2 duration-300">
              ✓ Vote Successfully Recorded
            </h1>
            <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg py-2 max-w-sm mx-auto font-medium">
              Your vote has been permanently recorded.
            </p>
          </div>

          {/* Receipt Card */}
          <div className="bg-muted/40 rounded-xl p-5 border border-border/70 text-left space-y-4 text-sm font-sans">
            <div className="flex justify-between border-b border-border/50 pb-2">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Election Name</span>
              <span className="font-semibold text-foreground">{txDetails.electionName}</span>
            </div>
            
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Transaction ID</span>
              <span className="font-mono text-xs text-foreground bg-background rounded border border-border p-2 select-all break-all leading-relaxed">
                {txDetails.voteId}
              </span>
            </div>

            <div className="flex flex-col space-y-1">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Audit Hash</span>
              <span className="font-mono text-[11px] text-foreground bg-background rounded border border-border p-2 select-all break-all leading-normal">
                {txDetails.currentHash}
              </span>
            </div>

            <div className="flex justify-between border-t border-border/50 pt-3 text-xs">
              <span className="text-muted-foreground font-semibold uppercase tracking-wider">Timestamp</span>
              <span className="font-mono text-foreground font-semibold">{new Date(txDetails.timestamp).toLocaleString()}</span>
            </div>
          </div>

          <div className="pt-2">
            <Button
              className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 w-full rounded-xl py-6 font-semibold shadow-md transition-all text-base"
              onClick={handleReturnToDashboard}
            >
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Block screen if voter doesn't exist or is not permitted to vote
  if (voter && !voter.vote_permission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center bg-card rounded-2xl shadow-sm border border-border p-10 space-y-5">
          <div className="mx-auto h-20 w-20 rounded-full bg-warning/15 flex items-center justify-center animate-in zoom-in duration-500">
            <Lock className="h-10 w-10 text-warning" />
          </div>
          <h1 className="text-2xl font-bold mt-5 text-foreground">Access Denied</h1>
          <p className="text-sm text-muted-foreground">
            The election coordinator has not authorized your student profile to vote yet.
          </p>
          <p className="text-xs text-muted-foreground">
            Please wait for admin approval on the dashboard or contact the election coordinator.
          </p>
          {/* Session timer only shown during voting — hidden on blocked screen */}
          <div className="pt-4">
            <Button
              className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 w-full rounded-xl py-3 font-semibold"
              onClick={() => nav({ to: "/voter/dashboard" })}
            >
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const presidents = candidates.filter(
    (c) => c.position === "President" && (c.status || "").toLowerCase() === "approved",
  );

  async function tryVerify() {
    const idToVerify = verificationCode.trim();
    if (!/^[A-Z0-9]{8}$/.test(idToVerify)) {
      toast.error("Verification ID must be exactly 8 uppercase letters and numbers.");
      return;
    }

    setIsVerifying(true);
    try {
      const res = await verifyVoterId(idToVerify);
      if (res.success) {
        // Mark verification session so route guards and recovery know
        // the user properly passed through verification ID validation.
        sessionStorage.setItem("collegevote-verification-session", "true");
        if (res.anti_replay_token) {
          setAntiReplayToken(res.anti_replay_token);
        }
        setStep("ballot");
        toast.success("Verification successful!");
      }
    } catch (e: any) {
      console.error(e);
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      toast.error(e.message || "Invalid Verification ID");
      if (nextAttempts >= 3) {
        toast.error("Session locked due to too many failed attempts.");
        logout();
        nav({ to: "/" });
      }
    } finally {
      setIsVerifying(false);
    }
  }

  // ── Verification session guard: ensures no step is restored past ──
  //    verification_id without a valid verification session.
  //    Also ensures candidate selection exists before face_verification.
  useEffect(() => {
    // Don't interfere with the verification_id or success steps
    if (step === "verification_id") return;
    // Cast needed because TS narrows step after the first check and removes "success"
    // from the union, even though the useEffect runs in a fresh closure each time.
    if ((step as string) === "success") return;

    const hasVerificationSession = sessionStorage.getItem("collegevote-verification-session") === "true";
    if (!hasVerificationSession) {
      toast.error("Verification session missing. Please start over.");
      // Reset everything back to the verification step
      clearRecoverySession();
      setAntiReplayToken("");
      setSelected(null);
      setPassive("idle");
      setStep("verification_id");
      return;
    }

    // Face verification requires a selected candidate
    if (step === "face_verification" && !selected) {
      toast.error("No candidate selected. Please start over.");
      setStep("ballot");
      return;
    }
  }, [step, selected]);

  // ── Cleanup on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (detectionLoopRef.current) clearInterval(detectionLoopRef.current);
      captureAbortRef.current = true;
    };
  }, []);

  // ── Eagerly preload face-api.js as soon as the vote page mounts ──
  // This runs in background so by the time user clicks Review, model is ready.
  useEffect(() => {
    let cancelled = false;
    const preload = async () => {
      try {
        if (faceApiLoadedRef.current) return;
        const existing = document.getElementById("faceapi-cdn");
        if (existing) return; // already injecting
        const s = document.createElement("script");
        s.id = "faceapi-cdn";
        s.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
        s.crossOrigin = "anonymous";
        s.onload = async () => {
          if (cancelled) return;
          try {
            const faceapi = (window as any).faceapi;
            await faceapi.nets.tinyFaceDetector.loadFromUri(
              "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights"
            );
            if (!cancelled) faceApiLoadedRef.current = true;
          } catch { /* silent — will retry on review open */ }
        };
        document.head.appendChild(s);
      } catch { /* silent background preload failure */ }
    };
    // Slight delay so it doesn't compete with the initial page render
    const t = setTimeout(preload, 800);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  // ── Sync passiveState to ref (for use in async callbacks) ─
  const setPassive = useCallback((s: PassiveState) => {
    setPassiveState(s);
    passiveStateRef.current = s;
  }, []);

  // ── Load face-api.js from CDN (tiny-face-detector only) ──
  const loadFaceApi = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (faceApiLoadedRef.current) { resolve(); return; }
      const existing = document.getElementById("faceapi-cdn");
      if (existing) {
        // Script tag already injected — may just need a moment to settle
        const check = () => (window as any).faceapi ? (faceApiLoadedRef.current = true, resolve()) : reject(new Error("face-api.js not available"));
        setTimeout(check, 800);
        return;
      }
      const s = document.createElement("script");
      s.id = "faceapi-cdn";
      s.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
      s.crossOrigin = "anonymous";
      s.onload = async () => {
        try {
          const faceapi = (window as any).faceapi;
          await faceapi.nets.tinyFaceDetector.loadFromUri(
            "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights"
          );
          faceApiLoadedRef.current = true;
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      s.onerror = () => reject(new Error("Failed to load face-api.js from CDN."));
      document.head.appendChild(s);
    });
  }, []);

  // Wait until the video element advances to a new frame (avoids duplicate captures).
  const waitForNewVideoFrame = useCallback((video: HTMLVideoElement, timeoutMs = 1500): Promise<boolean> => {
    return new Promise((resolve) => {
      const startTime = video.currentTime;
      const deadline = performance.now() + timeoutMs;

      const done = (advanced: boolean) => resolve(advanced);

      // Chrome, Edge, Brave — precise per-frame callback when available
      const rvfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
      if (typeof rvfc === "function") {
        let settled = false;
        const onFrame = () => {
          if (settled) return;
          if (video.currentTime !== startTime) {
            settled = true;
            done(true);
            return;
          }
          if (performance.now() >= deadline) {
            settled = true;
            done(false);
            return;
          }
          rvfc.call(video, onFrame);
        };
        rvfc.call(video, onFrame);
        return;
      }

      const tick = () => {
        if (video.currentTime !== startTime) {
          done(true);
          return;
        }
        if (performance.now() >= deadline) {
          done(false);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, []);

  // ── Capture one normalized frame from the webcam ──────────
  const captureFrame = useCallback((): string | null => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState < 2) {
      console.warn("[face-capture] Video not ready (readyState:", video?.readyState, ")");
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width  = FRAME_W;
    canvas.height = FRAME_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    const canvasRatio = FRAME_W / FRAME_H;
    const videoRatio = videoW / videoH;

    let sx = 0, sy = 0, sw = videoW, sh = videoH;
    if (videoRatio > canvasRatio) {
      // Video is wider than canvas ratio (e.g. landscape 4:3 vs portrait 3:4) -> crop sides
      sw = videoH * canvasRatio;
      sx = (videoW - sw) / 2;
    } else {
      // Video is taller than canvas ratio -> crop top/bottom
      sh = videoW / canvasRatio;
      sy = (videoH - sh) / 2;
    }

    console.log("[face-verify] Frame captured", { videoW, videoH, resolution: `${FRAME_W}x${FRAME_H}`, quality: JPEG_QUALITY });

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, FRAME_W, FRAME_H);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    // Immediately release canvas
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  }, []);

  // ── Random jitter delay (req #3) ─────────────────────────
  const jitterDelay = () =>
    new Promise<void>((r) =>
      setTimeout(r, JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS))
    );

  // Record ballot start time for honeypot timing detection
  useEffect(() => {
    if (step === "ballot" || step === "confirm_vote") {
      reviewStartRef.current = Date.now();
    }
  }, [step]);

  const handleCastVoteWithParams = useCallback(async (faceToken: string, replayToken: string) => {
    if (!selected) {
      toast.error("Please select a candidate or NOTA.");
      return;
    }
    setIsSubmitting(true);
    try {
      const elapsedMs = reviewStartRef.current > 0 ? Date.now() - reviewStartRef.current : 99999;
      const res = await castVote({
        candidateId: selected === NOTA_ID ? null : selected,
        verificationId: verificationCode.trim(),
        faceSessionToken: faceToken,
        antiReplayToken: replayToken,
        trapData: {
          verification_field_confirm: hpField1,
          hidden_field_name: hpField2,
          phone_confirm: hpField3,
          submit_time_ms: elapsedMs,
        },
      });

      // Persist voted status
      try {
        localStorage.setItem("collegevote-has-voted", "true");
      } catch (e) {
        console.error(e);
      }

      // Save receipt in state and localStorage (expires in 24 hours)
      const txData = {
        voteId: res.vote_id,
        currentHash: res.current_hash,
        electionName: res.election_name || "Active Election",
        timestamp: res.timestamp || new Date().toISOString(),
      };
      setTxDetails(txData);

      const receipt = {
        ...txData,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem("collegevote-receipt", JSON.stringify(receipt));

      // Invalidate cached queries so dashboard shows fresh data immediately
      queryClient.invalidateQueries({ queryKey: ["voter-profile"] });
      queryClient.invalidateQueries({ queryKey: ["election-phase"] });
      queryClient.invalidateQueries({ queryKey: ["election"] });

      setStep("success");
      toast.success("Vote cast successfully!");
      clearRecoverySession();
    } catch (err: any) {
      console.error(err);
      const msg = err.message || "Failed to cast vote. Please try again.";
      toast.error(msg);

      // Check if biometric token expired, consumed, or invalid
      const isBiometricExpiry =
        msg.toLowerCase().includes("expired") ||
        msg.toLowerCase().includes("biometric verification token") ||
        msg.toLowerCase().includes("biometric session token") ||
        msg.toLowerCase().includes("consumed") ||
        msg.toLowerCase().includes("invalid");
      
      if (isBiometricExpiry) {
        toast.error("Face verification expired or invalid. Please verify again.");
        // Clear stale token and restart face verification
        setFaceSessionToken(null);
        setPassive("idle");
        setPassiveError("");
        setCapturedCount(0);
        // Clear recovery session so stale token isn't restored on reload
        sessionStorage.removeItem("collegevote-recovery-faceSessionToken");
        setStep("face_verification");
      } else {
        setPassive("failed");
        setPassiveError(msg);
        setStep("face_verification");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [selected, verificationCode, hpField1, hpField2, hpField3, queryClient]);

  // ── Main passive capture + submit flow ─────────────────────
  const runPassiveCapture = useCallback(async () => {
    console.log("[face-verify] Starting passive capture flow — TOTAL_FRAMES =", TOTAL_FRAMES);
    captureAbortRef.current = false;
    setPassive("detecting");
    setPassiveError("");
    setCapturedCount(0);
    setFaceDetected(false);
    setWebcamError(null);

    let activeToken = antiReplayToken;
    // Refresh anti-replay token dynamically so retries/subsequent runs always have a fresh valid token
    try {
      const res = await verifyVoterId(verificationCode.trim());
      if (res.success && res.anti_replay_token) {
        activeToken = res.anti_replay_token;
        setAntiReplayToken(res.anti_replay_token);
      }
    } catch (e) {
      console.error("Anti-replay token refresh failed:", e);
    }

    const isCameraActive = !!(webcamRef.current?.video && webcamRef.current.video.readyState >= 2);
    setWebcamReady(isCameraActive);
    setMatchScore(null);

    // Wait for webcam to be ready (up to 4 seconds, polling every 80ms)
    let waitedMs = 0;
    while ((!webcamRef.current?.video || webcamRef.current.video.readyState < 2) && waitedMs < 4000) {
      await new Promise((r) => setTimeout(r, 80));
      waitedMs += 80;
    }
    if (!webcamRef.current?.video || webcamRef.current.video.readyState < 2) {
      console.error("[face-verify] Camera timeout — waited 4s, webcam not ready");
      setPassive("failed");
      setPassiveError("Camera took too long to start. Please try again.");
      return;
    }

    if (captureAbortRef.current) return;
    setFaceDetected(true);
    setPassiveError("");
    console.log("[face-verify] Camera ready, starting capture of", TOTAL_FRAMES, "frames");

    // ── Phase 2: Capture frames with jitter ──────────────
    setPassive("capturing");
    const frames: string[] = [];
    let captureErrors = 0;

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (captureAbortRef.current) {
        setPassive("failed");
        setPassiveError("Verification canceled.");
        return;
      }

      // Check camera health before capture
      const video = webcamRef.current?.video;
      if (!video || video.readyState < 2) {
        console.warn("[face-verify] Camera lost at frame", i);
        setPassive("failed");
        setPassiveError("Unable to verify live face. Camera connection lost.");
        return;
      }

      const advanced = await waitForNewVideoFrame(video);
      const frame = captureFrame();
      if (!frame) {
        captureErrors++;
        console.warn("[face-verify] Frame capture failed at index", i, "(error count:", captureErrors, ")");
        if (captureErrors >= 3) {
          console.error("[face-verify] Too many capture errors, aborting");
          setPassive("failed");
          setPassiveError("Unable to verify live face. Please try again.");
          return;
        }
        continue;
      }

      frames.push(frame);
      setCapturedCount(frames.length);
      console.log("[face-verify] Captured frame", frames.length, "of", TOTAL_FRAMES);

      // Jitter delay between frames
      if (i < TOTAL_FRAMES - 1) await jitterDelay();
    }

    if (frames.length < 3) {
      console.error("[face-verify] Not enough frames captured:", frames.length);
      setPassive("failed");
      setPassiveError("Unable to verify live face. Please try again.");
      return;
    }

    console.log("[face-verify] Captured", frames.length, "frames, submitting to backend");

    // ── Phase 3: Submit to backend ─────────────────────────
    setPassive("submitting");
    setIsSubmitting(true);

    try {
      const verifyRes = await verifyFacePassive({ frames, antiReplayToken: activeToken });

      console.log("[face-verify] Backend response:", {
        success: verifyRes.success,
        match_score: verifyRes.match_score,
        frames_matched: verifyRes.frames_matched,
        frames_total: verifyRes.frames_total,
        has_token: !!verifyRes.face_session_token,
      });

      // Clear frames from memory immediately after sending
      frames.length = 0;

      if (verifyRes.success && verifyRes.face_session_token) {
        setFaceSessionToken(verifyRes.face_session_token);
        if (verifyRes.match_score !== undefined) setMatchScore(verifyRes.match_score);
        setPassive("success");
        console.log("[face-verify] Verification SUCCESS — match score:", verifyRes.match_score);
        toast.success("Face verified successfully!");
        
        setTimeout(() => {
          handleCastVoteWithParams(verifyRes.face_session_token, activeToken);
        }, 1500);
      } else {
        console.warn("[face-verify] Verification returned success=false or no token");
        setPassive("failed");
        setPassiveError("Unable to verify live face. Please try again.");
      }
    } catch (err: any) {
      console.error("[face-verify] Verification FAILED —", err.message || err);
      frames.length = 0; // clear on error too
      if (err.match_score !== undefined) {
        console.log("[face-verify] Match score from error:", err.match_score);
        setMatchScore(err.match_score);
      }
      const msg = err.message ?? "";
      console.log("[face-verify] Error details:", { message: msg, match_score: err.match_score });
      if (
        msg.toLowerCase().includes("lockout") ||
        msg.toLowerCase().includes("locked") ||
        msg.toLowerCase().includes("too many failed")
      ) {
        setPassiveError(msg); // show lockout message verbatim
        setPassive("failed");
        setTimeout(() => { logout(); nav({ to: "/" }); }, 3000);
      } else {
        // Generic message for all other failures
        setPassive("failed");
        setPassiveError("Unable to verify live face. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [antiReplayToken, captureFrame, waitForNewVideoFrame, logout, nav, verificationCode, handleCastVoteWithParams]);

  // ── Auto-start capture immediately when face_verification opens ─────
  useEffect(() => {
    if (step === "face_verification" && passiveStateRef.current === "idle") {
      const t = setTimeout(() => runPassiveCapture(), 100);
      return () => clearTimeout(t);
    }
  }, [step, runPassiveCapture]);

  function abortPassive() {
    captureAbortRef.current = true;
    setPassive("idle");
    setPassiveError("");
    setCapturedCount(0);
    setFaceDetected(false);
  }

  if (step === "verification_id") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-sm p-8 text-center border border-border">
          <div className="mx-auto h-14 w-14 rounded-full bg-[#0F8A5F]/10 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-[#0F8A5F]" />
          </div>
          <h1 className="text-xl font-bold mt-4">Identity Verification</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Enter the <strong>Verification Code</strong> given to you by the election coordinator.
          </p>
          <Input
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
            placeholder="e.g. A7K9P2XQ"
            maxLength={8}
            className="mt-5 text-center h-12 tracking-widest font-mono text-lg animate-in fade-in slide-in-from-bottom-2 duration-350"
            onKeyDown={(e) => e.key === "Enter" && tryVerify()}
          />
          {attempts > 0 && (
            <p className="text-xs text-destructive mt-2">
              Invalid code. {3 - attempts} attempts remaining.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            3 failed attempts will lock your session.
          </p>
          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => nav({ to: "/voter/dashboard" })}
              disabled={isVerifying}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-[#0F8A5F] hover:bg-[#0F8A5F]/90 text-white rounded-xl font-semibold shadow-sm transition-all"
              onClick={tryVerify}
              disabled={!verificationCode.trim() || isVerifying || verificationCode.length !== 8}
            >
              {isVerifying ? "Verifying..." : "Verify & Proceed"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const selectedCandidate =
    selected === NOTA_ID ? null : presidents.find((c) => (c.candidate_id || c.id) === selected);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Cast Your Vote — President</h1>
          <div className="flex items-center gap-4">
            {timeLeft && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-muted rounded-full text-xs font-mono font-semibold text-destructive">
                <Clock className="h-3 w-3" />
                Session: {timeLeft}
              </div>
            )}
            <button
              onClick={() => nav({ to: "/voter/dashboard" })}
              className="p-2 hover:bg-muted rounded-md"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8">
        {step === "ballot" && (
          <>
            <h2 className="text-xl md:text-2xl font-bold mb-1">Choose your President</h2>
            <p className="text-sm text-muted-foreground mb-6">
              The Vice President and General Secretary are part of each presidential ticket. Select
              one ticket, or choose NOTA.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {presidents.map((c) => {
                const cId = c.candidate_id || c.id;
                const isSel = selected === cId;
                return (
                  <button
                    key={cId}
                    onClick={() => setSelected(cId)}
                    className={cn(
                      "text-left bg-card rounded-2xl shadow-sm p-5 transition-all border-2",
                      isSel
                        ? "border-[#0F8A5F] ring-2 ring-[#0F8A5F]/30"
                        : "border-transparent hover:shadow-md",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 rounded-xl bg-[#0F8A5F]/10 flex items-center justify-center text-3xl">
                        {c.symbol ?? "🎓"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{c.full_name || c.name}</p>
                        <p className="text-[11px] text-muted-foreground italic truncate">
                          {c.party}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.semester} Sem · {c.department}
                        </p>
                      </div>
                    </div>
                    {c.manifesto ? (
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer font-medium text-[#0F8A5F]">
                          Read manifesto
                        </summary>
                        <p className="mt-2 text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {c.manifesto}
                        </p>
                      </details>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground italic">
                        Manifesto not yet approved for public viewing.
                      </p>
                    )}
                    <div
                      className={cn(
                        "mt-4 w-full py-2 rounded-lg text-sm font-medium text-center border",
                        isSel
                          ? "bg-[#0F8A5F] text-white border-[#0F8A5F]"
                          : "bg-background border-border",
                      )}
                    >
                      {isSel ? "● Selected" : "○ Select this ticket"}
                    </div>
                  </button>
                );
              })}

              {/* NOTA card */}
              <button
                onClick={() => setSelected(NOTA_ID)}
                className={cn(
                  "text-left bg-card rounded-2xl shadow-sm p-5 transition-all border-2 flex flex-col",
                  selected === NOTA_ID
                    ? "border-destructive ring-2 ring-destructive/30"
                    : "border-dashed border-border hover:shadow-md",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Ban className="h-7 w-7 text-destructive" />
                  </div>
                  <div>
                    <p className="font-semibold">NOTA</p>
                    <p className="text-[11px] text-muted-foreground italic">None Of The Above</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground leading-relaxed flex-1">
                  Choose this if you do not wish to vote for any of the listed candidates. Your vote
                  is still counted and recorded.
                </p>
                <div
                  className={cn(
                    "mt-4 w-full py-2 rounded-lg text-sm font-medium text-center border",
                    selected === NOTA_ID
                      ? "bg-destructive text-destructive-foreground border-destructive"
                      : "bg-background border-border",
                  )}
                >
                  {selected === NOTA_ID ? "● Selected" : "○ Select NOTA"}
                </div>
              </button>
            </div>

            <div className="flex justify-between mt-8 gap-3">
              <Button variant="outline" onClick={() => nav({ to: "/voter/dashboard" })} className="rounded-xl font-semibold">
                ← Cancel
              </Button>
              <Button
                disabled={!selected || isSubmitting}
                className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 rounded-xl font-semibold shadow-md transition-all px-6"
                onClick={() => setStep("confirm_vote")}
              >
                Review Vote →
              </Button>
            </div>
          </>
        )}

        {step === "confirm_vote" && (
          <div className="max-w-md mx-auto bg-card rounded-2xl shadow-sm border border-border p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="mx-auto h-14 w-14 rounded-full bg-[#0F8A5F]/10 flex items-center justify-center mb-5">
              <ShieldCheck className="h-7 w-7 text-[#0F8A5F]" />
            </div>
            
            <h2 className="text-2xl font-bold mb-2">Confirm Your Vote</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Please review your selection below before proceeding to the final identity verification.
            </p>

            <div className="bg-muted/50 rounded-xl p-5 border border-border/80 text-left mb-6 space-y-3">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">Your Selected Ballot</span>
              {selected === NOTA_ID ? (
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                    <Ban className="h-6 w-6 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-destructive">NOTA</h3>
                    <p className="text-xs text-muted-foreground">None Of The Above</p>
                  </div>
                </div>
              ) : (
                selectedCandidate && (
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-[#0F8A5F]/10 flex items-center justify-center text-2xl shrink-0">
                      {selectedCandidate.symbol ?? "🎓"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-lg text-foreground truncate">{selectedCandidate.full_name || selectedCandidate.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">{selectedCandidate.party}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{selectedCandidate.semester} Sem · {selectedCandidate.department}</p>
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 mb-6 text-left">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                Once confirmed, you must complete the face liveness check. Upon successful verification, your vote will be cast immediately. <strong>This action cannot be undone.</strong>
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-xl py-6 font-semibold"
                onClick={() => setStep("ballot")}
              >
                ← Back
              </Button>
              <Button
                className="flex-1 bg-[#0F8A5F] hover:bg-[#0F8A5F]/90 text-white rounded-xl py-6 font-semibold shadow-md"
                onClick={() => setStep("face_verification")}
              >
                Confirm & Verify
              </Button>
            </div>
          </div>
        )}

        {step === "face_verification" && (
          <div className="bg-card rounded-2xl shadow-sm p-6 md:p-8 max-w-2xl mx-auto">
            {/* ── Honeypot fields (invisible to humans, traps bots) ── */}
            <div
              aria-hidden="true"
              className="hp-field-confirm"
              style={{
                position: "absolute",
                left: "-9999px",
                opacity: 0,
                height: 0,
                overflow: "hidden",
              }}
            >
              <input
                type="text"
                name="verification_field_confirm"
                tabIndex={-1}
                autoComplete="off"
                value={hpField1}
                onChange={(e) => setHpField1(e.target.value)}
              />
              <input
                type="text"
                name="hidden_field_name"
                tabIndex={-1}
                autoComplete="off"
                value={hpField2}
                onChange={(e) => setHpField2(e.target.value)}
              />
              <input
                type="text"
                name="phone_confirm"
                tabIndex={-1}
                autoComplete="off"
                value={hpField3}
                onChange={(e) => setHpField3(e.target.value)}
              />
              {/* Hidden submit button traps form-submission bots */}
              <button type="button" tabIndex={-1} style={{ display: "none" }} />
            </div>

            <h2 className="text-xl font-bold mb-2">Face Liveness Verification</h2>
            <p className="text-sm text-muted-foreground mb-6">
              To cast your vote, please complete a live face check to verify your identity against your student profile picture.
            </p>

            <div className="bg-[#0F8A5F]/10 border border-[#D9A441]/30 rounded-lg p-4 flex gap-3 mb-6">
              <ShieldCheck className="h-5 w-5 text-[#0F8A5F] shrink-0 mt-0.5" />
              <p className="text-sm text-foreground/85">
                By proceeding, your live camera feed will capture a few frames to verify liveness and authenticity.
              </p>
            </div>

            {/* ── Passive Face Verification UI ─────────────── */}
            <div className="mb-6">

              {/* Camera feed — always mounted while review is open so capture is instant */}
              <div
                className={cn(
                  "rounded-xl overflow-hidden border-2 relative bg-black max-w-sm mx-auto shadow-lg mb-4",
                  passiveState === "failed" ? "border-destructive/50" :
                  passiveState === "success" ? "border-emerald-500" :
                  faceDetected ? "border-emerald-400" : "border-[#0F8A5F]"
                )}
                style={{ aspectRatio: "3/4" }}
              >
                {/* Live badge */}
                <div className="absolute top-2.5 left-2.5 bg-black/65 text-white text-[10px] px-2 py-1 rounded-md z-10 flex items-center gap-1.5 font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  Face Verification
                </div>

                {/* Face oval guide */}
                {(passiveState === "detecting" || passiveState === "capturing") && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div
                      className={cn(
                        "w-[55%] h-[75%] rounded-[50%] border-2 transition-colors duration-300",
                        faceDetected ? "border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]" : "border-dashed border-[#0F8A5F]/70"
                      )}
                    />
                  </div>
                )}

                {/* Camera errors */}
                {webcamError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-5 gap-3 z-20">
                    <AlertTriangle className="h-7 w-7 text-destructive" />
                    <p className="text-xs text-destructive text-center">{webcamError}</p>
                    <Button size="sm" variant="outline" onClick={runPassiveCapture}>Retry Camera</Button>
                  </div>
                ) : (
                  <>
                    {!webcamReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
                        <div className="text-center space-y-2">
                          <div className="animate-spin h-6 w-6 border-2 border-[#0F8A5F] border-t-transparent rounded-full mx-auto" />
                          <p className="text-xs text-white">Starting camera...</p>
                        </div>
                      </div>
                    )}
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      screenshotQuality={JPEG_QUALITY}
                      videoConstraints={{ facingMode: "user", width: FRAME_W, height: FRAME_H }}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      onUserMedia={() => setWebcamReady(true)}
                      onUserMediaError={() => {
                        setWebcamError("Camera access denied. Enable camera permissions and refresh.");
                        toast.error("Camera access denied.");
                      }}
                    />
                  </>
                )}

                {/* Success overlay */}
                {passiveState === "success" && (
                  <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center z-20">
                    <div className="h-16 w-16 rounded-full bg-emerald-500/90 flex items-center justify-center animate-in zoom-in duration-300">
                      <Check className="h-9 w-9 text-white" />
                    </div>
                  </div>
                )}
              </div>

              {/* Status card below camera */}
              <div className="bg-card border border-border rounded-xl p-5 text-center space-y-3 max-w-sm mx-auto shadow-sm">

                {/* DETECTING */}
                {passiveState === "detecting" && (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <ScanFace className={cn("h-5 w-5 transition-colors", faceDetected ? "text-emerald-500" : "text-[#0F8A5F]")} />
                      <span className="text-sm font-semibold">
                        {faceDetected ? "Face detected — hold still..." : "Position your face in the frame"}
                      </span>
                    </div>
                    {passiveError && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
                        {passiveError}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">No gestures required — just look at the camera.</p>
                  </>
                )}

                {/* CAPTURING */}
                {passiveState === "capturing" && (
                  <>
                    <p className="text-sm font-semibold text-foreground">Hold still — verifying identity</p>
                    <div className="flex justify-center gap-1.5">
                      {Array.from({ length: TOTAL_FRAMES }).map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-2.5 w-2.5 rounded-full transition-all duration-300",
                            i < capturedCount ? "bg-emerald-500 scale-110" : "bg-muted"
                          )}
                        />
                      ))}
                    </div>
                    <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0F8A5F] transition-all duration-500"
                        style={{ width: `${(capturedCount / TOTAL_FRAMES) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Capturing frame {capturedCount + 1} of {TOTAL_FRAMES}...</p>
                  </>
                )}

                {/* SUBMITTING */}
                {passiveState === "submitting" && (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-[#0F8A5F] border-t-transparent rounded-full" />
                      <span className="text-sm font-semibold">Verifying...</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Matching against enrolled student photo.</p>
                  </>
                )}

                {/* SUCCESS */}
                {passiveState === "success" && (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <Check className="h-5 w-5 text-emerald-500" />
                      <span className="text-sm font-semibold text-emerald-600">
                        {isSubmitting ? "Casting your vote..." : "Verified successfully!"}
                      </span>
                    </div>
                    {matchScore !== null && (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs text-muted-foreground">Face match</span>
                        <span
                          className={cn(
                            "text-sm font-bold px-2.5 py-0.5 rounded-full",
                            matchScore >= 80 ? "bg-emerald-100 text-emerald-700" :
                            matchScore >= 65 ? "bg-amber-100 text-amber-700" :
                            "bg-orange-100 text-orange-700"
                          )}
                        >
                          {matchScore.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden max-w-xs mx-auto">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          matchScore !== null && matchScore >= 80 ? "bg-emerald-500" :
                          matchScore !== null && matchScore >= 65 ? "bg-amber-500" :
                          "bg-emerald-500"
                        )}
                        style={{ width: matchScore !== null ? `${Math.min(matchScore, 100)}%` : "90%" }}
                      />
                    </div>
                  </>
                )}

                {/* FAILED */}
                {passiveState === "failed" && (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <X className="h-5 w-5 text-destructive" />
                      <span className="text-sm font-semibold text-destructive">Verification Failed</span>
                    </div>
                    {matchScore !== null && (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs text-muted-foreground">Face match</span>
                        <span
                          className={cn(
                            "text-sm font-bold px-2.5 py-0.5 rounded-full",
                            matchScore >= 80 ? "bg-emerald-100 text-emerald-700" :
                            matchScore >= 65 ? "bg-amber-100 text-amber-700" :
                            "bg-orange-100 text-orange-700"
                          )}
                        >
                          {matchScore.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {passiveError || "Unable to verify live face. Please try again."}
                    </p>
                    {matchScore === 0.0 && (
                      <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 mt-2 text-left">
                        Tip: Make sure you are in a well-lit room, look straight at the camera, remove glasses/mask, and hold still.
                      </p>
                    )}
                    {!(
                      passiveError?.toLowerCase().includes("lockout") ||
                      passiveError?.toLowerCase().includes("locked")
                    ) ? (
                      <div className="flex justify-center gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => { abortPassive(); setStep("confirm_vote"); }}>
                          ← Back
                        </Button>
                        <Button
                          size="sm"
                          className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90"
                          onClick={runPassiveCapture}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-destructive font-semibold">
                        You are temporarily locked out. Please try again later.
                      </p>
                    )}
                  </>
                )}

                {/* IDLE fallback */}
                {passiveState === "idle" && (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-[#0F8A5F] border-t-transparent rounded-full" />
                      <span className="text-sm font-semibold">Starting camera...</span>
                    </div>
                    <p className="text-xs text-muted-foreground">No gestures required — just look at the camera.</p>
                  </>
                )}

                {/* Cancel button during active phases */}
                {(passiveState === "detecting" || passiveState === "capturing") && (
                  <div className="pt-1">
                    <Button variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={() => { abortPassive(); setStep("confirm_vote"); }}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
