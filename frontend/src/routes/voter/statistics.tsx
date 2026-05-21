import { createFileRoute } from "@tanstack/react-router";
import { PageLoader } from "@/components/PageLoader";
import { useDeptTurnout, useHourlyVotes } from "@/hooks/use-election-data";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { Info } from "lucide-react";

export const Route = createFileRoute("/voter/statistics")({ component: Page });

function Page() {
  const { data: deptTurnout = [], isPending: loadingDept } = useDeptTurnout();
  const { data: hourlyVotes = [], isPending: loadingHourly } = useHourlyVotes();

  if (loadingDept || loadingHourly) return <PageLoader />;

  const turnoutData = [{ name: "Voted", value: 43 }, { name: "Remaining", value: 57 }];
  const COLORS = ["#6C63FF", "#E5E7EB"];
  const totalVotes = turnoutData.reduce((sum, item) => sum + item.value, 0);
  const votedPercent = Math.round((turnoutData[0].value / totalVotes) * 100);

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
        <Chart title="Votes by Department">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={deptTurnout} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis type="number" stroke="#94a3b8" fontSize={12} />
              <YAxis type="category" dataKey="dept" stroke="#94a3b8" fontSize={12} />
              <Tooltip />
              <Bar dataKey="turnout" fill="#1F3A6E" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
        <Chart title="Overall Turnout" className="xl:col-span-2">
          <div className="grid gap-6 md:grid-cols-[minmax(280px,420px)_1fr] md:items-center">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={turnoutData} innerRadius={70} outerRadius={100} dataKey="value" paddingAngle={2}>
                  {turnoutData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Voted" value={`${turnoutData[0].value}%`} tone="primary" />
              <Stat label="Remaining" value={`${turnoutData[1].value}%`} tone="muted" />
              <Stat label="Turnout" value={`${votedPercent}%`} tone="dark" />
            </div>
          </div>
        </Chart>
      </div>
    </div>
  );
}

function Chart({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card rounded-2xl border border-border/70 shadow-sm p-5 ${className}`}>
      <h2 className="text-base font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "primary" | "muted" | "dark" }) {
  const toneClass =
    tone === "primary"
      ? "bg-[#6C63FF]/10 text-[#6C63FF]"
      : tone === "dark"
        ? "bg-[#1F3A6E]/10 text-[#1F3A6E]"
        : "bg-muted text-muted-foreground";

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-2 inline-flex rounded-lg px-3 py-1 text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
