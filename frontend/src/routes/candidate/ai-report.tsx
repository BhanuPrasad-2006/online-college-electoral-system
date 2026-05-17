import { createFileRoute, Link } from "@tanstack/react-router";
import { PageLoader } from "@/components/PageLoader";
import { useConcernCategories } from "@/hooks/use-election-data";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

function Page() {
  const { data: categories = [], isPending } = useConcernCategories();
  if (isPending) return <PageLoader />;

  const chartData = categories.map((c) => ({ name: c.name.split(" ")[0], Positive: c.positive, Neutral: c.neutral, Negative: c.negative }));
  const overall = [{ name: "Positive", value: 14 }, { name: "Neutral", value: 34 }, { name: "Negative", value: 52 }];
  const COLORS = ["#22c55e", "#cbd5e1", "#ef4444"];
  const priorities = categories.filter((c) => !c.covered).slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">What Students Are Saying</h1>
        <p className="text-sm text-muted-foreground mt-1">AI-powered analysis of student concerns vs your manifesto.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {CONCERN_CATEGORIES.slice(0, 6).map((c) => (
          <div key={c.name} className="bg-card rounded-2xl shadow-sm p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.mentions} mentions</p>
              </div>
              {c.covered
                ? <span className="inline-flex items-center gap-1 text-success text-[11px] font-semibold"><Check className="h-3 w-3" /> Covered</span>
                : <span className="inline-flex items-center gap-1 text-destructive text-[11px] font-semibold"><X className="h-3 w-3" /> Gap</span>}
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-muted mt-4">
              <div style={{ width: `${c.positive}%` }} className="bg-success" />
              <div style={{ width: `${c.neutral}%` }} className="bg-muted-foreground/40" />
              <div style={{ width: `${c.negative}%` }} className="bg-destructive" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">+{c.positive}% / ~{c.neutral}% / -{c.negative}%</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card rounded-2xl shadow-sm p-5 lg:col-span-2">
          <h2 className="text-base font-semibold mb-4">Sentiment by Category</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip /><Legend />
              <Bar dataKey="Positive" stackId="a" fill="#22c55e" />
              <Bar dataKey="Neutral" stackId="a" fill="#cbd5e1" />
              <Bar dataKey="Negative" stackId="a" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-semibold mb-4">Overall Sentiment</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={overall} innerRadius={50} outerRadius={85} dataKey="value">
                {overall.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Legend /><Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5">
        <h2 className="text-base font-semibold mb-4">Suggested Manifesto Additions</h2>
        <div className="space-y-3">
          {priorities.map((c, i) => (
            <div key={c.name} className="flex items-center justify-between p-4 bg-muted/40 rounded-lg gap-3 flex-wrap">
              <div>
                <p className="text-xs text-[#6C63FF] font-semibold">Priority {i + 1}</p>
                <p className="text-sm font-medium mt-0.5">Address {c.name.toLowerCase()} — {c.mentions} students concerned, {c.negative}% negative</p>
              </div>
              <Link to="/candidate/manifesto"><Button size="sm" className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90">Add to Manifesto →</Button></Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/candidate/ai-report")({ component: Page });
