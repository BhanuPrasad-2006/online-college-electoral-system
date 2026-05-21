import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Brain, Bold, Italic, List, Heading, Check, X } from "lucide-react";
import { toast } from "sonner";

const CATS = [
  { name: "Wi-Fi & Infrastructure", coverage: 89, covered: true },
  { name: "Placements", coverage: 76, covered: true },
  { name: "Mental Health", coverage: 0, covered: false },
  { name: "Transportation", coverage: 12, covered: false },
];

const SUGGESTIONS = [
  "Add: Mental Health Support Services",
  "Add: Transportation Schedule Improvement",
  "Add: Hostel Maintenance Plan",
];

function Page() {
  const [text, setText] = useState(
    "## Infrastructure & Facilities\nUpgrade campus Wi-Fi to fiber-optic backbone across all blocks.\n\n## Academics & Placements\nLaunch a structured placement training program from 2nd year onward.\n\n## Student Welfare\n\n## Events & Culture\n"
  );
  const overall = 64;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Manifesto Editor</h1>
        <p className="text-sm text-muted-foreground mt-1">Draft and refine your manifesto with AI guidance.</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-4 flex items-center gap-3">
        <span className="text-sm font-medium">Coverage:</span>
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-[#6C63FF]" style={{ width: `${overall}%` }} />
        </div>
        <span className="text-sm font-bold tabular-nums">{overall}%</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-card rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-1 pb-3 border-b border-border mb-3">
            {[Bold, Italic, List, Heading].map((I, i) => (
              <button key={i} className="p-2 hover:bg-muted rounded-md"><I className="h-4 w-4" /></button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-[420px] resize-none text-sm leading-relaxed focus:outline-none bg-transparent font-mono"
          />
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground">{text.length} characters</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.success("Draft saved")}>Save Draft</Button>
              <Button size="sm" className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90" onClick={() => toast.success("Manifesto submitted")}>Submit Manifesto</Button>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-2 bg-card rounded-2xl shadow-sm p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-[#6C63FF]" />
            <h2 className="text-base font-semibold">AI Recommendations</h2>
          </div>
          <div className="space-y-2">
            {CATS.map((c) => (
              <div key={c.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {c.covered ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}
                    <span>{c.name}</span>
                  </div>
                  <span className={c.covered ? "text-success text-xs font-medium" : "text-destructive text-xs font-medium"}>{c.coverage}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={c.covered ? "h-full bg-success" : "h-full bg-destructive"} style={{ width: `${c.coverage}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Suggested Additions</h3>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setText((t) => t + `\n\n${s.replace("Add: ", "## ")}\n[Outline a concrete plan here]\n`)}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-[#6C63FF]/10 text-[#6C63FF] hover:bg-[#6C63FF]/15"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/candidate/manifesto")({ component: Page });
