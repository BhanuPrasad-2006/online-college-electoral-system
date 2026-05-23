import { createFileRoute } from "@tanstack/react-router";
import { PageLoader } from "@/components/PageLoader";
import { useDeptTurnout, useHourlyVotes } from "@/hooks/use-election-data";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Info, Search, TrendingUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/voter/statistics")({ component: Page });

function Page() {
  const { data: deptTurnout = [], isPending: loadingDept } = useDeptTurnout();
  const { data: hourlyVotes = [], isPending: loadingHourly } = useHourlyVotes();
  const [searchQuery, setSearchQuery] = useState("");

  if (loadingDept || loadingHourly) return <PageLoader />;

  const turnoutData = [{ name: "Voted", value: 43 }, { name: "Remaining", value: 57 }];
  const COLORS = ["#6C63FF", "#E5E7EB"];
  const totalVotes = turnoutData.reduce((sum, item) => sum + item.value, 0);
  const votedPercent = Math.round((turnoutData[0].value / totalVotes) * 100);

  // Filter department stats based on search
  const filteredDepts = deptTurnout.filter((d: any) => 
    (d.department || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Statistics</h1>
        <p className="text-sm text-muted-foreground mt-1">Aggregated election data and turnout insights.</p>
      </div>
      <div className="bg-[#6C63FF]/10 border border-[#6C63FF]/30 rounded-xl p-4 flex gap-3">
        <Info className="h-5 w-5 text-[#6C63FF] shrink-0 mt-0.5" />
        <p className="text-sm">Individual voter data is never displayed. All statistics are aggregated.</p>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Chart title="Overall Turnout">
          <div className="grid gap-6 md:grid-cols-[minmax(200px,300px)_1fr] md:items-center">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={turnoutData} innerRadius={70} outerRadius={100} dataKey="value" paddingAngle={2}>
                  {turnoutData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid gap-4">
              <Stat label="Voted" value={`${turnoutData[0].value}%`} tone="primary" />
              <Stat label="Remaining" value={`${turnoutData[1].value}%`} tone="muted" />
              <Stat label="Turnout" value={`${votedPercent}%`} tone="dark" />
            </div>
          </div>
        </Chart>

        <Chart title="Votes by Hour">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={hourlyVotes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="hour" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="votes" stroke="#6C63FF" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Chart>
      </div>

      <div className="bg-card rounded-2xl border border-border/70 shadow-sm p-6 mt-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#6C63FF]" />
            <h2 className="text-xl font-semibold">Department Breakdown</h2>
          </div>
          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              type="text"
              placeholder="Search departments..."
              className="pl-9 pr-4 py-2 w-full rounded-xl border border-border/60 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/40 text-sm transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {filteredDepts.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No departments found matching "{searchQuery}"
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDepts.map((stat: any, i: number) => (
              <div 
                key={stat.department}
                className={cn(
                  "bg-background border border-border/50 rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md hover:border-[#6C63FF]/30 transition-all",
                  "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]"
                )}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-lg text-[#1F3A6E]">{stat.department}</h3>
                  <div className="px-2.5 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-lg text-sm font-semibold border border-violet-200 dark:border-violet-800/30">
                    {stat.turnout_percentage}%
                  </div>
                </div>
                
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-[#6C63FF] to-violet-400 h-full transition-all duration-1000 ease-out"
                    style={{ width: `${stat.turnout_percentage}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 mt-1 pt-3 border-t border-border/40 text-center">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total</span>
                    <span className="font-bold text-base">{stat.total_voters}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-success/80 uppercase tracking-wider font-semibold mb-1">Voted</span>
                    <span className="font-bold text-base text-success">{stat.voted}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Pending</span>
                    <span className="font-bold text-base">{stat.not_voted}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chart({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card rounded-2xl border border-border/70 shadow-sm p-5 flex flex-col h-full ${className}`}>
      <h2 className="text-base font-semibold mb-4">{title}</h2>
      <div className="flex-1 flex flex-col justify-center">
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "primary" | "muted" | "dark" }) {
  const toneClass =
    tone === "primary"
      ? "bg-[#6C63FF]/10 text-[#6C63FF] border-[#6C63FF]/20"
      : tone === "dark"
        ? "bg-[#1F3A6E]/10 text-[#1F3A6E] border-[#1F3A6E]/20"
        : "bg-muted text-muted-foreground border-border/50";

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`mt-2 inline-flex rounded-lg px-3 py-1 text-xl font-bold border ${toneClass}`}>{value}</p>
    </div>
  );
}
