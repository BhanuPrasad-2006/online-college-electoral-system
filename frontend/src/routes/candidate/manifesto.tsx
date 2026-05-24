import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Brain, Bold, Italic, List, Heading, AlertTriangle, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { useCandidateProfile } from "@/hooks/use-election-data";
import { updateManifesto } from "@/lib/api";
import { PageLoader } from "@/components/PageLoader";

function Page() {
  const { data: profile, isPending, refetch } = useCandidateProfile();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (profile && profile.manifesto) {
      setText(profile.manifesto);
    }
  }, [profile]);

  if (isPending) return <PageLoader />;

  // Dynamic metrics from backend AI analysis
  const sentimentVal = profile?.sentiment_score !== undefined ? Math.round(profile.sentiment_score * 100) : 50;
  const feasibilityVal = profile?.feasibility_score !== undefined ? Math.round(profile.feasibility_score * 100) : 50;
  const themes = profile?.key_themes || ["General"];
  const contradictions = profile?.contradictions || [];
  const impactStatements = profile?.impact_statements || [];

  const handleSaveDraft = () => {
    localStorage.setItem("manifesto-draft", text);
    toast.success("Draft saved locally");
  };

  const handleSubmit = async () => {
    if (!text.trim() || text.trim().length < 20) {
      toast.error("Manifesto must be at least 20 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await updateManifesto(text);
      toast.success("Manifesto submitted successfully!");
      refetch(); // Reload candidate profile to refresh AI metrics
    } catch (err: any) {
      toast.error(err.message || "Failed to update manifesto.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Manifesto Editor</h1>
        <p className="text-sm text-muted-foreground mt-1">Draft and refine your manifesto with AI guidance.</p>
      </div>

      {/* Contradictions Alert */}
      {contradictions.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <span>Conflicting Promises Detected (Submission Locked)</span>
          </div>
          <div className="text-xs space-y-1.5 pl-7 text-muted-foreground">
            {contradictions.map((c: any, i: number) => (
              <p key={i}>
                <strong>{c.promise_a || "Promise A"}</strong> conflicts with <strong>{c.promise_b || "Promise B"}</strong>: {c.explanation || c}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Impact Statements Note Card */}
      {impactStatements.length > 0 && (
        <div className="bg-[#6C63FF]/10 border border-[#6C63FF]/25 text-[#6C63FF] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <HelpCircle className="h-5 w-5 text-[#6C63FF] shrink-0" />
            <span>AI System Impact Notes (Public Estimates)</span>
          </div>
          <div className="text-xs space-y-2.5 pl-7 text-muted-foreground">
            {impactStatements.map((imp: any, i: number) => (
              <div key={i} className="space-y-0.5">
                <p className="font-semibold text-foreground">Promise: "{imp.promise}"</p>
                <p className="italic">System Estimate: {imp.trade_off}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-card rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-1 pb-3 border-b border-border">
            {[Bold, Italic, List, Heading].map((I, i) => (
              <button key={i} className="p-2 hover:bg-muted rounded-md"><I className="h-4 w-4" /></button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-[380px] resize-none text-sm leading-relaxed focus:outline-none bg-transparent font-mono border-0 focus:ring-0"
            placeholder="Type your campaign manifesto here. Describe your vision, goals, and campaign promises..."
          />
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground">{text.length} characters</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSaveDraft}>Save Draft</Button>
              <Button 
                size="sm" 
                className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90" 
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Analyzing..." : "Submit Manifesto"}
              </Button>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-2 bg-card rounded-2xl shadow-sm p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-[#6C63FF]" />
            <h2 className="text-base font-semibold">AI Analysis & Metrics</h2>
          </div>
          <div className="space-y-4">
            {/* Feasibility score bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span>Feasibility Score</span>
                <span className="text-[#6C63FF]">{feasibilityVal}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-success" style={{ width: `${feasibilityVal}%` }} />
              </div>
            </div>

            {/* Sentiment score bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span>Sentiment Score</span>
                <span className="text-[#6C63FF]">{sentimentVal}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-[#6C63FF]" style={{ width: `${sentimentVal}%` }} />
              </div>
            </div>

            {/* Key Themes list */}
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-2">Key Identified Themes</span>
              <div className="flex flex-wrap gap-1.5">
                {themes.map((theme: string) => (
                  <span key={theme} className="px-2.5 py-1 bg-muted rounded-full text-xs font-medium">
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/candidate/manifesto")({ component: Page });
