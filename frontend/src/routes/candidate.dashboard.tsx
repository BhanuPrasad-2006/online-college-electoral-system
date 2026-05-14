import { createFileRoute, Link } from "@tanstack/react-router";
import { CANDIDATE_USER, NOTIFICATIONS } from "@/lib/mock";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, FileCheck, Brain, Bell } from "lucide-react";

function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Welcome back, {CANDIDATE_USER.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground mt-1">Running for {CANDIDATE_USER.position} · {CANDIDATE_USER.department}</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5 md:p-6">
        <h2 className="text-base font-semibold mb-5">Application Status</h2>
        <div className="flex items-center">
          {[
            { label: "Submitted", date: "Oct 28, 10:14 AM", state: "done" },
            { label: "Under Review", date: "Oct 29, 2:30 PM", state: "done" },
            { label: "Approved", date: "Oct 30, 9:00 AM", state: "active" },
          ].map((s, i, a) => (
            <div key={i} className="flex-1 flex items-center">
              <div className="flex flex-col items-center">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${
                  s.state === "done" ? "bg-success text-white" : s.state === "active" ? "bg-[#1F3A6E] text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {s.state === "done" ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                </div>
                <p className="text-xs font-medium mt-2 text-center">{s.label}</p>
                <p className="text-[10px] text-muted-foreground">{s.date}</p>
              </div>
              {i < a.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${s.state === "done" ? "bg-success" : "bg-border"}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Application Status" value={<Badge className="bg-success text-white">Approved</Badge>} icon={FileCheck} />
        <Stat label="Manifesto Status" value={<Badge className="bg-[#6C63FF] text-white">Published</Badge>} icon={FileCheck} />
        <Stat label="AI Report" value={<Link to="/candidate/ai-report" className="text-[#6C63FF] font-semibold hover:underline">View →</Link>} icon={Brain} />
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-5 w-5 text-[#6C63FF]" />
          <h2 className="text-base font-semibold">AI Report Summary</h2>
        </div>
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-4">
          <p className="text-sm font-semibold">Top Student Concern: Wi-Fi & Infrastructure</p>
          <p className="text-xs text-muted-foreground mt-1">412 mentions · 67% negative sentiment</p>
        </div>
        <div className="space-y-2 mb-5">
          <div className="flex justify-between text-sm">
            <span>Manifesto coverage of top concerns</span>
            <span className="font-semibold">64%</span>
          </div>
          <Progress value={64} className="h-2" />
        </div>
        <div className="flex gap-3">
          <Link to="/candidate/ai-report" className="inline-flex items-center px-4 py-2 rounded-lg bg-[#1F3A6E] text-white text-sm font-medium hover:bg-[#1F3A6E]/90">View Full AI Report</Link>
          <Link to="/candidate/manifesto" className="inline-flex items-center px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted">Edit Manifesto</Link>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-[#6C63FF]" />
          <h2 className="text-base font-semibold">Recent Notifications</h2>
        </div>
        <div className="space-y-3">
          {NOTIFICATIONS.slice(0, 4).map((n) => (
            <div key={n.id} className="flex items-start gap-3 py-2">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: any) {
  return (
    <div className="bg-card rounded-2xl shadow-sm p-5 flex items-center gap-4">
      <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-[#6C63FF]/10 text-[#6C63FF]"><Icon className="h-6 w-6" /></div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="mt-1">{value}</div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/candidate/dashboard")({ component: Page });
