import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { CANDIDATES } from "@/lib/mock";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader, SectionCard } from "@/components/ui/page-header";
import { ArrowLeft, Brain, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/candidate/$id")({
  component: CandidateDetailPage,
});

function CandidateDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();

  const candidate = CANDIDATES.find((c) => c.id === id);

  if (!candidate) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => nav({ to: ".." })}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <PageHeader title="Candidate Not Found" subtitle="The candidate you are looking for does not exist." />
      </div>
    );
  }

  const initials = candidate.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  return (
    <div className="space-y-6">
      <button
        onClick={() => history.back()}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <SectionCard className="flex-1 w-full animate-fade-in-up [animation-fill-mode:forwards]">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <Avatar className="h-32 w-32 ring-4 ring-[#6C63FF]/20 shadow-xl">
              <AvatarFallback className="text-4xl bg-gradient-to-br from-[#6C63FF]/15 to-[#1F3A6E]/15 text-[#6C63FF] font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="text-center sm:text-left space-y-2 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h1 className="text-3xl font-bold">{candidate.name}</h1>
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#6C63FF]/10 text-[#6C63FF] text-sm font-medium">
                  {candidate.position}
                </span>
              </div>
              <p className="text-lg text-muted-foreground italic">{candidate.party}</p>

              <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-border/50">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Department</p>
                  <p className="font-medium text-foreground">{candidate.department}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Semester</p>
                  <p className="font-medium text-foreground">{candidate.semester}</p>
                </div>
                {candidate.symbol && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Symbol</p>
                    <p className="text-2xl mt-1">{candidate.symbol}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard className="animate-fade-in-up [animation-fill-mode:forwards]" delay={100}>
        <h2 className="text-xl font-semibold mb-4 border-b border-border/50 pb-2">Manifesto</h2>
        <p className="text-foreground/80 leading-relaxed whitespace-pre-wrap">
          {candidate.manifesto}
        </p>
      </SectionCard>

      <SectionCard className="animate-fade-in-up [animation-fill-mode:forwards] bg-gradient-to-br from-card to-card/50" delay={200}>
        <div className="flex items-center gap-2 mb-6">
          <Brain className="h-6 w-6 text-[#6C63FF]" />
          <h2 className="text-xl font-semibold">AI Analysis</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <h3 className="font-medium">Strengths</h3>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="text-[#6C63FF]">•</span> Strong focus on infrastructure</li>
              <li className="flex gap-2"><span className="text-[#6C63FF]">•</span> Clear actionable goals in manifesto</li>
              <li className="flex gap-2"><span className="text-[#6C63FF]">•</span> High match ({candidate.match}%) with your concerns</li>
            </ul>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              <h3 className="font-medium">Potential Areas of Concern</h3>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="text-warning">•</span> Vague on budget allocation details</li>
              <li className="flex gap-2"><span className="text-warning">•</span> Less emphasis on extracurriculars</li>
            </ul>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
