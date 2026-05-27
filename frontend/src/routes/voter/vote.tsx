import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import Webcam from "react-webcam";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates, useVoterProfile, useCurrentPhase, useElection } from "@/hooks/use-election-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, X, ShieldCheck, Ban, Lock, Clock, Smile, RefreshCw, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { castVote, verifyVoterId, verifyFace } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/voter/vote")({ component: VotePage });

const NOTA_ID = "nota";

function VotePage() {
  const nav = useNavigate();
  const { logout } = useAuth();
  const [verified, setVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [antiReplayToken, setAntiReplayToken] = useState<string>("");
  const [webcamReady, setWebcamReady] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // ── Liveness State ────────────────────────────────────────
  const [livenessState, setLivenessState] = useState<"idle" | "loading_model" | "active" | "success" | "failed">("idle");
  const [challenges, setChallenges] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [livenessError, setLivenessError] = useState("");
  const [timerLeft, setTimerLeft] = useState(45);
  const [faceSessionToken, setFaceSessionToken] = useState<string | null>(null);
  
  const faceMeshRef = useRef<any>(null);
  const livenessTimerRef = useRef<any>(null);
  const livenessLoopRef = useRef<any>(null);
  const videoCheckRef = useRef<any>(null);

  // ── Honeypot (bot detection) fields ──────────────────────
  const [hpField1, setHpField1] = useState("");
  const [hpField2, setHpField2] = useState("");
  const [hpField3, setHpField3] = useState("");
  // Track when the review screen (with face capture) first renders
  const reviewStartRef = useRef<number>(0);

  // Record review start time for honeypot timing detection
  useEffect(() => {
    if (review) {
      reviewStartRef.current = Date.now();
    }
  }, [review]);

  const webcamRef = useRef<Webcam>(null);

  const { data: candidates = [], isPending } = useCandidates();
  const { data: voter, isPending: isVoterPending } = useVoterProfile();
  const { data: phaseData } = useCurrentPhase();
  const { data: election } = useElection();

  // ── Reconcile phase the same way the dashboard does ──────
  // Prefer date-derived phase when it shows voting_open
  // but the backend phase endpoint hasn't caught up yet.
  // Memoized to avoid creating a new object reference every render.
  const effectivePhase = useMemo(() => {
    if (!phaseData?.phase) return phaseData;
    if (!election) return phaseData;
    const now = Date.now();
    const votStart = (election as any).voting_start
      ? new Date((election as any).voting_start).getTime()
      : (election as any).votingStart
        ? new Date((election as any).votingStart).getTime()
        : null;
    const votEnd = (election as any).voting_end
      ? new Date((election as any).voting_end).getTime()
      : (election as any).votingEnd
        ? new Date((election as any).votingEnd).getTime()
        : null;
    if (votStart && votEnd && now >= votStart && now < votEnd && phaseData.phase !== "voting_open") {
      return { ...phaseData, phase: "voting_open" };
    }
    return phaseData;
  }, [phaseData, election]);

  // ── Phase gate: redirect if voting is not open ────────────
  useEffect(() => {
    if (effectivePhase && effectivePhase.phase !== "voting_open") {
      toast.error("Voting is not currently open.");
      nav({ to: "/voter/dashboard" });
    }
  }, [effectivePhase, nav]);

  useEffect(() => {
    // JWT Session Timer
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
  }, [logout, nav]);

  if ((isPending || isVoterPending) && !verified && !confirmed) return <PageLoader />;

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
              className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90 w-full rounded-xl py-3 font-semibold"
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
        if (res.anti_replay_token) {
          setAntiReplayToken(res.anti_replay_token);
        }
        setVerified(true);
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

  // Cleanup liveness timers/loops on unmount or review change
  useEffect(() => {
    return () => {
      if (livenessTimerRef.current) clearInterval(livenessTimerRef.current);
      if (livenessLoopRef.current) clearInterval(livenessLoopRef.current);
      if (videoCheckRef.current) clearInterval(videoCheckRef.current);
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.close();
        } catch (e) {
          console.error("Failed to close FaceMesh:", e);
        }
      }
    };
  }, []);

  const currentStepRef = useRef(0);
  const challengesRef = useRef<string[]>([]);
  const livenessStateRef = useRef<string>("idle");

  const updateLivenessState = (state: "idle" | "loading_model" | "active" | "success" | "failed") => {
    setLivenessState(state);
    livenessStateRef.current = state;
  };

  const updateCurrentStep = (step: number) => {
    setCurrentStep(step);
    currentStepRef.current = step;
  };

  const updateChallenges = (challs: string[]) => {
    setChallenges(challs);
    challengesRef.current = challs;
  };

  const loadMediaPipe = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).FaceMesh) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";
      script.crossOrigin = "anonymous";
      script.onload = () => {
        if ((window as any).FaceMesh) {
          resolve();
        } else {
          reject(new Error("FaceMesh was loaded but not found in global context."));
        }
      };
      script.onerror = () => {
        reject(new Error("Failed to load FaceMesh library from CDN. Check your internet connection."));
      };
      document.head.appendChild(script);
    });
  };

  function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  function startLivenessCheck() {
    updateLivenessState("loading_model");
    setLivenessError("");
    setWebcamReady(false);
    setWebcamError(null);

    loadMediaPipe()
      .then(() => {
        if (!faceMeshRef.current) {
          const FaceMesh = (window as any).FaceMesh;
          const fm = new FaceMesh({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
          });
          fm.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
          });
          fm.onResults(onLivenessResults);
          faceMeshRef.current = fm;
        }

        const allChalls = ["blink", "left", "right", "mouth"];
        const shuffled = [...allChalls].sort(() => Math.random() - 0.5).slice(0, 3);
        updateChallenges(shuffled);
        updateCurrentStep(0);
        setTimerLeft(45);
        updateLivenessState("active");

        if (livenessTimerRef.current) clearInterval(livenessTimerRef.current);
        livenessTimerRef.current = setInterval(() => {
          setTimerLeft((t) => {
            if (t <= 1) {
              clearInterval(livenessTimerRef.current);
              failLiveness("Verification timed out. Try again in a brighter area.");
              return 0;
            }
            return t - 1;
          });
        }, 1000);

        if (livenessLoopRef.current) clearInterval(livenessLoopRef.current);
        livenessLoopRef.current = setInterval(() => {
          captureAndProcessFrame();
        }, 250);
      })
      .catch((err) => {
        updateLivenessState("failed");
        setLivenessError(err.message || "Failed to load FaceMesh model.");
      });
  }

  async function captureAndProcessFrame() {
    if (livenessStateRef.current !== "active") return;
    if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
      const video = webcamRef.current.video;
      if (faceMeshRef.current) {
        try {
          await faceMeshRef.current.send({ image: video });
        } catch (e) {
          console.error("Error sending image to FaceMesh:", e);
        }
      }
    }
  }

  function onLivenessResults(results: any) {
    if (livenessStateRef.current !== "active") return;

    const faceLandmarks = results.multiFaceLandmarks;
    if (!faceLandmarks || faceLandmarks.length === 0) {
      setLivenessError("No face detected. Align your face inside the camera frame.");
      return;
    }

    if (faceLandmarks.length > 1) {
      setLivenessError("Multiple faces detected. Ensure only one person is visible.");
      return;
    }

    setLivenessError("");

    const landmarks = faceLandmarks[0];
    const activeChallenge = challengesRef.current[currentStepRef.current];
    if (!activeChallenge) return;

    const leftEyeV = getDistance(landmarks[159], landmarks[145]);
    const leftEyeH = getDistance(landmarks[33], landmarks[133]);
    const leftEAR = leftEyeV / leftEyeH;

    const rightEyeV = getDistance(landmarks[386], landmarks[374]);
    const rightEyeH = getDistance(landmarks[362], landmarks[263]);
    const rightEAR = rightEyeV / rightEyeH;

    const avgEAR = (leftEAR + rightEAR) / 2;

    const mouthV = getDistance(landmarks[13], landmarks[14]);
    const mouthH = getDistance(landmarks[78], landmarks[308]);
    const mar = mouthV / mouthH;

    const distNoseLeft = getDistance(landmarks[1], landmarks[33]);
    const distNoseRight = getDistance(landmarks[1], landmarks[263]);
    const yawRatio = distNoseLeft / (distNoseLeft + distNoseRight);

    let passed = false;
    if (activeChallenge === "blink") {
      if (avgEAR < 0.16) {
        passed = true;
      }
    } else if (activeChallenge === "left") {
      if (yawRatio < 0.38) {
        passed = true;
      }
    } else if (activeChallenge === "right") {
      if (yawRatio > 0.62) {
        passed = true;
      }
    } else if (activeChallenge === "mouth") {
      if (mar > 0.25) {
        passed = true;
      }
    }

    if (passed) {
      const nextStep = currentStepRef.current + 1;
      if (nextStep >= challengesRef.current.length) {
        completeLiveness();
      } else {
        updateCurrentStep(nextStep);
        toast.success("Challenge completed! Next task...");
      }
    }
  }

  async function captureScreenshot(): Promise<string | null> {
    for (let i = 0; i < 3; i++) {
      if (webcamRef.current) {
        const src = webcamRef.current.getScreenshot();
        if (src) return src;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }

  async function completeLiveness() {
    updateLivenessState("success");
    if (livenessTimerRef.current) clearInterval(livenessTimerRef.current);
    if (livenessLoopRef.current) clearInterval(livenessLoopRef.current);

    setIsCapturing(true);
    const screenshot = await captureScreenshot();
    setIsCapturing(false);

    if (!screenshot) {
      failLiveness("Failed to capture fresh face frame. Try again.");
      return;
    }

    setIsSubmitting(true);
    try {
      const verifyRes = await verifyFace({
        liveFaceImage: screenshot,
        antiReplayToken
      });

      if (verifyRes.success && verifyRes.face_session_token) {
        setFaceSessionToken(verifyRes.face_session_token);
        const elapsedMs = reviewStartRef.current > 0 ? Date.now() - reviewStartRef.current : 99999;

        await castVote({
          candidateId: selected === NOTA_ID ? null : selected,
          verificationId: verificationCode.trim(),
          faceSessionToken: verifyRes.face_session_token,
          antiReplayToken,
          trapData: {
            verification_field_confirm: hpField1,
            hidden_field_name: hpField2,
            phone_confirm: hpField3,
            submit_time_ms: elapsedMs
          }
        });

        setConfirmed(true);
        toast.success("Vote cast successfully!");
      } else {
        failLiveness("Biometric face match failed.");
      }
    } catch (err: any) {
      console.error(err);
      failLiveness(err.message || "Failed to submit biometrics.");
      if (
        err.message?.toLowerCase().includes("lockout") ||
        err.message?.toLowerCase().includes("locked") ||
        err.message?.toLowerCase().includes("too many failed")
      ) {
        setTimeout(() => {
          logout();
          nav({ to: "/" });
        }, 3000);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function failLiveness(reason: string) {
    updateLivenessState("failed");
    setLivenessError(reason);
    if (livenessTimerRef.current) clearInterval(livenessTimerRef.current);
    if (livenessLoopRef.current) clearInterval(livenessLoopRef.current);
  }

  if (confirmed) {
    // Persist voted status so dashboard reflects it (localStorage survives tab close)
    try {
      localStorage.setItem("collegevote-has-voted", "true");
    } catch {
      /* ignore */
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center bg-card rounded-2xl shadow-sm p-10">
          <div className="mx-auto h-20 w-20 rounded-full bg-success/15 flex items-center justify-center animate-in zoom-in duration-500">
            <CheckCircle2 className="h-12 w-12 text-success" />
          </div>
          <h1 className="text-2xl font-bold mt-5">Vote Cast Successfully!</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your vote has been cast securely and anonymously.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Your status on the dashboard will now show <strong>Voted ✓</strong>.
          </p>
          <Button
            className="mt-6 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
            onClick={() => nav({ to: "/voter/dashboard" })}
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-sm p-8 text-center border border-border">
          <div className="mx-auto h-14 w-14 rounded-full bg-[#6C63FF]/10 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-[#6C63FF]" />
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
              className="flex-1 bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white rounded-xl font-semibold shadow-sm transition-all"
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
        {!review && (
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
                        ? "border-[#6C63FF] ring-2 ring-[#6C63FF]/30"
                        : "border-transparent hover:shadow-md",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 rounded-xl bg-[#6C63FF]/10 flex items-center justify-center text-3xl">
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
                    <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                        Running mates
                      </p>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Vice President</span>
                        <span className="font-medium">
                          {c.vice_president ?? c.runningMates?.vicePresident ?? "—"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Gen. Secretary</span>
                        <span className="font-medium">
                          {c.secretary ?? c.runningMates?.secretary ?? "—"}
                        </span>
                      </div>
                    </div>
                    {c.manifesto ? (
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer font-medium text-[#6C63FF]">
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
                          ? "bg-[#6C63FF] text-white border-[#6C63FF]"
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
              <Button variant="outline" onClick={() => nav({ to: "/voter/dashboard" })}>
                ← Cancel
              </Button>
              <Button
                disabled={!selected}
                className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
                onClick={() => setReview(true)}
              >
                Review →
              </Button>
            </div>
          </>
        )}

        {review && (
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

            <h2 className="text-xl font-bold mb-2">Review Your Selection</h2>
            <p className="text-sm text-muted-foreground mb-6">You are about to vote for:</p>

            {selected === NOTA_ID ? (
              <div className="p-4 bg-destructive/10 rounded-lg flex items-center gap-3 mb-6">
                <Ban className="h-6 w-6 text-destructive" />
                <div>
                  <p className="font-semibold">NOTA</p>
                  <p className="text-xs text-muted-foreground">None Of The Above</p>
                </div>
              </div>
            ) : selectedCandidate ? (
              <div className="p-4 bg-muted/40 rounded-lg space-y-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-[#6C63FF]/10 flex items-center justify-center text-2xl">
                    {selectedCandidate.symbol ?? "🎓"}
                  </div>
                  <div>
                    <p className="font-semibold">
                      {selectedCandidate.full_name || selectedCandidate.name}{" "}
                      <span className="text-xs text-muted-foreground">— President</span>
                    </p>
                    <p className="text-xs text-muted-foreground italic">
                      {selectedCandidate.party}
                    </p>
                  </div>
                </div>
                <div className="text-xs space-y-1 pt-2 border-t border-border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vice President</span>
                    <span className="font-medium">
                      {selectedCandidate.vice_president ??
                        selectedCandidate.runningMates?.vicePresident ??
                        "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gen. Secretary</span>
                    <span className="font-medium">
                      {selectedCandidate.secretary ??
                        selectedCandidate.runningMates?.secretary ??
                        "—"}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex gap-3 mb-6">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                This action is permanent and cannot be reversed. By proceeding, your live face will
                be matched against your enrolled student ID photo.
              </p>
            </div>

            <div className="mb-6">
              {livenessState === "idle" && (
                <div className="border border-border rounded-xl p-6 bg-card text-center space-y-4">
                  <div className="mx-auto h-16 w-16 rounded-full bg-[#6C63FF]/10 flex items-center justify-center animate-pulse">
                    <Smile className="h-8 w-8 text-[#6C63FF]" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Face Verification Required</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    To complete casting your vote, you must perform a brief biometric liveness check. 
                    This ensures a real, authorized voter is casting the ballot.
                  </p>
                  <div className="flex justify-center gap-3 pt-2">
                    <Button variant="outline" onClick={() => setReview(false)}>
                      ← Back
                    </Button>
                    <Button
                      className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90 font-semibold"
                      onClick={startLivenessCheck}
                    >
                      Start Face Verification
                    </Button>
                  </div>
                </div>
              )}

              {livenessState === "loading_model" && (
                <div className="border border-border rounded-xl p-8 bg-card text-center space-y-4">
                  <div className="animate-spin h-10 w-10 border-4 border-[#6C63FF] border-t-transparent rounded-full mx-auto" />
                  <h3 className="text-lg font-semibold text-foreground">Initializing Biometrics</h3>
                  <p className="text-sm text-muted-foreground">
                    Pre-loading face tracking models. Please grant camera access when prompted.
                  </p>
                </div>
              )}

              {livenessState === "active" && (
                <div className="space-y-4">
                  <div className="rounded-xl overflow-hidden border-2 border-[#6C63FF] relative bg-black aspect-video max-w-md mx-auto flex items-center justify-center shadow-lg">
                    <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] md:text-xs px-2.5 py-1 rounded-md z-10 flex items-center gap-1.5 font-medium tracking-wide">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      Liveness Verification
                    </div>

                    {/* Countdown Timer */}
                    <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-md z-10 flex items-center gap-1 font-semibold">
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                      <span>{timerLeft}s</span>
                    </div>

                    {/* Face placement silhouette guide */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                      <div className="w-[180px] h-[240px] rounded-[50%] border-2 border-dashed border-[#6C63FF]/80 bg-transparent flex items-center justify-center relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                        {/* Scanning Line */}
                        <div className="absolute left-0 right-0 h-0.5 bg-[#6C63FF] shadow-[0_0_8px_#6C63FF] animate-scan"></div>
                      </div>
                    </div>

                    {webcamError ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-muted/40 p-6 gap-3 z-20">
                        <AlertTriangle className="h-8 w-8 text-destructive" />
                        <p className="text-sm text-destructive font-medium text-center">{webcamError}</p>
                        <Button size="sm" variant="outline" onClick={startLivenessCheck}>
                          Retry Camera
                        </Button>
                      </div>
                    ) : (
                      <>
                        {!webcamReady && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
                            <div className="text-center space-y-2">
                              <div className="animate-spin h-6 w-6 border-2 border-[#6C63FF] border-t-transparent rounded-full mx-auto" />
                              <p className="text-xs text-white">Starting camera feed...</p>
                            </div>
                          </div>
                        )}
                        <Webcam
                          audio={false}
                          ref={webcamRef}
                          screenshotFormat="image/jpeg"
                          screenshotQuality={0.95}
                          videoConstraints={{ facingMode: "user", width: 640, height: 480 }}
                          playsInline={true}
                          muted={true}
                          className="w-full h-full object-cover"
                          onUserMedia={() => setWebcamReady(true)}
                          onUserMediaError={() => {
                            setWebcamError(
                              "Camera access denied or unavailable. Please enable camera permissions in your browser settings and refresh.",
                            );
                            toast.error("Camera access denied. Please enable permissions to vote.");
                          }}
                        />
                      </>
                    )}
                  </div>

                  {/* Challenge instruction card */}
                  <div className="bg-card border border-border rounded-xl p-5 text-center space-y-4 max-w-md mx-auto shadow-sm">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Step {currentStep + 1} of {challenges.length}
                    </div>
                    
                    <div className="text-lg font-bold text-foreground py-1">
                      {challenges[currentStep] === "blink" && "👁️ Blink your eyes"}
                      {challenges[currentStep] === "left" && "👈 Turn your head slowly to the left"}
                      {challenges[currentStep] === "right" && "👉 Turn your head slowly to the right"}
                      {challenges[currentStep] === "mouth" && "😮 Open your mouth wide"}
                    </div>

                    {/* Progress indicators */}
                    <div className="flex justify-center gap-2">
                      {challenges.map((_, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "h-2.5 w-2.5 rounded-full transition-all duration-300",
                            idx < currentStep
                              ? "bg-emerald-500"
                              : idx === currentStep
                                ? "bg-[#6C63FF] w-6"
                                : "bg-muted"
                          )}
                        />
                      ))}
                    </div>

                    {/* Live feedback warnings (e.g. alignment issues) */}
                    {livenessError && (
                      <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 py-1.5 px-3 rounded-md animate-in fade-in duration-300">
                        {livenessError}
                      </div>
                    )}

                    {/* Timer progress bar */}
                    <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-1000",
                          timerLeft < 15 ? "bg-destructive" : timerLeft < 30 ? "bg-amber-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${(timerLeft / 45) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => failLiveness("Verification canceled.")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {livenessState === "success" && (
                <div className="border border-border rounded-xl p-8 bg-card text-center space-y-4">
                  <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Check className="h-8 w-8 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Liveness Verified Successfully</h3>
                  <p className="text-sm text-muted-foreground">
                    {isSubmitting
                      ? "Transmitting biometrics and casting your vote..."
                      : "Capturing secure facial frame reference..."}
                  </p>
                  <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden max-w-xs mx-auto">
                    <div className="h-full bg-emerald-500 animate-pulse" style={{ width: "80%" }} />
                  </div>
                </div>
              )}

              {livenessState === "failed" && (
                <div className="border border-destructive/20 rounded-xl p-6 bg-destructive/5 text-center space-y-4">
                  <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <X className="h-8 w-8 text-destructive" />
                  </div>
                  <h3 className="text-lg font-semibold text-destructive">Verification Failed</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {livenessError || "We could not verify your liveness or biometric match."}
                  </p>
                  
                  {/* Do not show retry button if lockout is active */}
                  {!(livenessError?.toLowerCase().includes("lockout") || livenessError?.toLowerCase().includes("locked") || livenessError?.toLowerCase().includes("too many failed")) ? (
                    <div className="flex justify-center gap-3 pt-2">
                      <Button variant="outline" onClick={() => setReview(false)}>
                        ← Back
                      </Button>
                      <Button
                        className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90 font-semibold"
                        onClick={startLivenessCheck}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry Verification
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-destructive font-semibold">
                      You are temporarily locked out of biometric verification. Please try again later.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
