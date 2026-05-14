import { createFileRoute } from "@tanstack/react-router";
import { HOURLY_VOTES, DEPT_TURNOUT } from "@/lib/mock";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { Info } from "lucide-react";

export const Route = createFileRoute("/voter/statistics")({ component: Page });

function Page() {
  const turnoutData = [{ name: "Voted", value: 43 }, { name: "Remaining", value: 57 }];
  const COLORS = ["#6C63FF", "#E5E7EB"];
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Chart title="Votes by Department">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={DEPT_TURNOUT} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis type="number" stroke="#94a3b8" fontSize={12} />
              <YAxis type="category" dataKey="dept" stroke="#94a3b8" fontSize={12} />
              <Tooltip />
              <Bar dataKey="turnout" fill="#1F3A6E" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Chart>
        <Chart title="Votes by Hour">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={HOURLY_VOTES}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="hour" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="votes" stroke="#6C63FF" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Chart>
        <Chart title="Overall Turnout">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={turnoutData} innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={2}>
                {turnoutData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Legend /><Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Chart>
      </div>
    </div>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl shadow-sm p-5">
      <h2 className="text-base font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}
