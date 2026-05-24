import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates, useVoterProfile } from "@/hooks/use-election-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, X, ShieldCheck, Ban, Lock, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { castVote, verifyVoterId } from "@/lib/api";
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
          {timeLeft && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-destructive/10 text-destructive text-xs font-mono font-semibold rounded-full">
              <Clock className="h-3 w-3" />
              Session Expiration: {timeLeft}
            </div>
          )}
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

  const presidents = candidates.filter((c) => c.position === "President" && (c.status || "").toLowerCase() === "approved");

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

  async function handleCastVote() {
    if (!webcamRef.current) {
      toast.error("Please allow camera access to verify your identity.");
      return;
    }
    
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      toast.error("Failed to capture face. Please make sure your camera is working.");
      return;
    }

    // Calculate elapsed time since review screen appeared (bot detection timing check)
    const elapsedMs = reviewStartRef.current > 0
      ? Date.now() - reviewStartRef.current
      : 99999;

    setIsSubmitting(true);
    try {
      await castVote({
        candidateId: selected === NOTA_ID ? null : selected,
        verificationId: verificationCode.trim(),
        liveFaceImage: imageSrc,
        antiReplayToken,
        trapData: {
          verification_field_confirm: hpField1,
          hidden_field_name: hpField2,
          phone_confirm: hpField3,
          submit_time_ms: elapsedMs,
        },
      });
      setConfirmed(true);
      toast.success("Vote cast successfully!");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to cast vote. Please try again.");
      // If verification code was wrong, go back to verification screen
      if (e.message?.toLowerCase().includes("verification code")) {
        setVerified(false);
        setAttempts((a) => a + 1);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (confirmed) {
    // Persist voted status so dashboard reflects it (localStorage survives tab close)
    try { localStorage.setItem("collegevote-has-voted", "true"); } catch { /* ignore */ }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center bg-card rounded-2xl shadow-sm p-10">
          <div className="mx-auto h-20 w-20 rounded-full bg-success/15 flex items-center justify-center animate-in zoom-in duration-500">
            <CheckCircle2 className="h-12 w-12 text-success" />
          </div>
          <h1 className="text-2xl font-bold mt-5">Vote Cast Successfully!</h1>
          <p className="text-sm text-muted-foreground mt-2">Your vote has been cast securely and anonymously.</p>
          <p className="text-xs text-muted-foreground mt-1">Your status on the dashboard will now show <strong>Voted ✓</strong>.</p>
          <Button className="mt-6 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90" onClick={() => nav({ to: "/voter/dashboard" })}>Return to Dashboard</Button>
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
          {attempts > 0 && <p className="text-xs text-destructive mt-2">Invalid code. {3 - attempts} attempts remaining.</p>}
          <p className="text-xs text-muted-foreground mt-2">3 failed attempts will lock your session.</p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => nav({ to: "/voter/dashboard" })} disabled={isVerifying}>Cancel</Button>
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
    selected === NOTA_ID
      ? null
      : presidents.find((c) => (c.candidate_id || c.id) === selected);

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
            <button onClick={() => nav({ to: "/voter/dashboard" })} className="p-2 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8">
        {!review && (
          <>
            <h2 className="text-xl md:text-2xl font-bold mb-1">Choose your President</h2>
            <p className="text-sm text-muted-foreground mb-6">
              The Vice President and General Secretary are part of each presidential ticket.
              Select one ticket, or choose NOTA.
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
                      isSel ? "border-[#6C63FF] ring-2 ring-[#6C63FF]/30" : "border-transparent hover:shadow-md"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 rounded-xl bg-[#6C63FF]/10 flex items-center justify-center text-3xl">
                        {c.symbol ?? "🎓"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{c.full_name || c.name}</p>
                        <p className="text-[11px] text-muted-foreground italic truncate">{c.party}</p>
                        <p className="text-[11px] text-muted-foreground">{c.semester} Sem · {c.department}</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Running mates</p>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Vice President</span>
                        <span className="font-medium">{c.vice_president ?? c.runningMates?.vicePresident ?? "—"}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Gen. Secretary</span>
                        <span className="font-medium">{c.secretary ?? c.runningMates?.secretary ?? "—"}</span>
                      </div>
                    </div>
                    {c.manifesto ? (
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer font-medium text-[#6C63FF]">Read manifesto</summary>
                        <p className="mt-2 text-muted-foreground leading-relaxed whitespace-pre-wrap">{c.manifesto}</p>
                      </details>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground italic">Manifesto not yet approved for public viewing.</p>
                    )}
                    <div className={cn(
                      "mt-4 w-full py-2 rounded-lg text-sm font-medium text-center border",
                      isSel ? "bg-[#6C63FF] text-white border-[#6C63FF]" : "bg-background border-border"
                    )}>
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
                  selected === NOTA_ID ? "border-destructive ring-2 ring-destructive/30" : "border-dashed border-border hover:shadow-md"
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
                  Choose this if you do not wish to vote for any of the listed candidates.
                  Your vote is still counted and recorded.
                </p>
                <div className={cn(
                  "mt-4 w-full py-2 rounded-lg text-sm font-medium text-center border",
                  selected === NOTA_ID ? "bg-destructive text-destructive-foreground border-destructive" : "bg-background border-border"
                )}>
                  {selected === NOTA_ID ? "● Selected" : "○ Select NOTA"}
                </div>
              </button>
            </div>

            <div className="flex justify-between mt-8 gap-3">
              <Button variant="outline" onClick={() => nav({ to: "/voter/dashboard" })}>← Cancel</Button>
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
            <div aria-hidden="true" className="hp-field-confirm" style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}>
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
              <button type="button" tabIndex={-1} style={{ display: 'none' }} />
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
                    <p className="font-semibold">{selectedCandidate.full_name || selectedCandidate.name} <span className="text-xs text-muted-foreground">— President</span></p>
                    <p className="text-xs text-muted-foreground italic">{selectedCandidate.party}</p>
                  </div>
                </div>
                <div className="text-xs space-y-1 pt-2 border-t border-border">
                  <div className="flex justify-between"><span className="text-muted-foreground">Vice President</span><span className="font-medium">{selectedCandidate.vice_president ?? selectedCandidate.runningMates?.vicePresident ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Gen. Secretary</span><span className="font-medium">{selectedCandidate.secretary ?? selectedCandidate.runningMates?.secretary ?? "—"}</span></div>
                </div>
              </div>
            ) : null}

            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex gap-3 mb-6">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">This action is permanent and cannot be reversed. By proceeding, your live face will be matched against your enrolled student ID photo.</p>
            </div>
            
            <div className="mb-6 rounded-xl overflow-hidden border-2 border-border relative bg-muted/30">
              <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md z-10 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                Live Verification
              </div>
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: "user" }}
                className="w-full h-auto max-h-[300px] object-cover"
                onUserMediaError={() => toast.error("Camera access denied or unavailable. Please enable permissions.")}
              />
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setReview(false)}>← Back</Button>
              <Button
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleCastVote}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Verifying & Casting..." : "Capture Face & Cast Vote"}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
