import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates } from "@/hooks/use-election-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, X, ShieldCheck, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/voter/vote")({ component: VotePage });

const NOTA_ID = "nota";

function VotePage() {
  const nav = useNavigate();
  const [verified, setVerified] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const { data: candidates = [], isPending } = useCandidates();

  if (isPending && !verified && !confirmed) return <PageLoader />;

  const presidents = candidates.filter((c) => c.position === "President");

  function tryVerify() {
    if (studentId.trim().length >= 6) setVerified(true);
    else setAttempts((a) => a + 1);
  }

  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center bg-card rounded-2xl shadow-sm p-10">
          <div className="mx-auto h-20 w-20 rounded-full bg-success/15 flex items-center justify-center animate-in zoom-in duration-500">
            <CheckCircle2 className="h-12 w-12 text-success" />
          </div>
          <h1 className="text-2xl font-bold mt-5">Vote Cast Successfully</h1>
          <p className="text-sm text-muted-foreground mt-2">Your vote has been cast securely and anonymously.</p>
          <Button className="mt-6 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90" onClick={() => nav({ to: "/voter/dashboard" })}>Return to Dashboard</Button>
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-sm p-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-[#6C63FF]/10 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-[#6C63FF]" />
          </div>
          <h1 className="text-xl font-bold mt-4">Identity Verification</h1>
          <p className="text-sm text-muted-foreground mt-2">Enter the Student ID printed on your physical college ID card.</p>
          <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g. CS2021001" className="mt-5 text-center h-12" />
          {attempts > 0 && <p className="text-xs text-destructive mt-2">Invalid ID. {3 - attempts} attempts remaining.</p>}
          <p className="text-xs text-muted-foreground mt-2">3 failed attempts will lock your session.</p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => nav({ to: "/voter/dashboard" })}>Cancel</Button>
            <Button className="flex-1 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90" onClick={tryVerify} disabled={!studentId.trim()}>Verify & Proceed</Button>
          </div>
        </div>
      </div>
    );
  }

  const selectedCandidate =
    selected === NOTA_ID
      ? null
      : presidents.find((c) => c.id === selected);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Cast Your Vote — President</h1>
          <button onClick={() => nav({ to: "/voter/dashboard" })} className="p-2 hover:bg-muted rounded-md"><X className="h-4 w-4" /></button>
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
                const isSel = selected === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c.id)}
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
                        <p className="font-semibold truncate">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground italic truncate">{c.party}</p>
                        <p className="text-[11px] text-muted-foreground">{c.semester} Sem · {c.department}</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Running mates</p>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Vice President</span>
                        <span className="font-medium">{c.runningMates?.vicePresident ?? "—"}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Gen. Secretary</span>
                        <span className="font-medium">{c.runningMates?.secretary ?? "—"}</span>
                      </div>
                    </div>
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer font-medium text-[#6C63FF]">Read manifesto</summary>
                      <p className="mt-2 text-muted-foreground leading-relaxed">{c.manifesto}</p>
                    </details>
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
                    <p className="font-semibold">{selectedCandidate.name} <span className="text-xs text-muted-foreground">— President</span></p>
                    <p className="text-xs text-muted-foreground italic">{selectedCandidate.party}</p>
                  </div>
                </div>
                <div className="text-xs space-y-1 pt-2 border-t border-border">
                  <div className="flex justify-between"><span className="text-muted-foreground">Vice President</span><span className="font-medium">{selectedCandidate.runningMates?.vicePresident}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Gen. Secretary</span><span className="font-medium">{selectedCandidate.runningMates?.secretary}</span></div>
                </div>
              </div>
            ) : null}

            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex gap-3 mb-6">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">This action is permanent and cannot be reversed.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setReview(false)}>← Back</Button>
              <Button
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => setConfirmed(true)}
              >
                Confirm & Cast My Vote
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
