import { createFileRoute } from "@tanstack/react-router";
import { PageLoader } from "@/components/PageLoader";
import { useAiAlerts, useHourlyVotes } from "@/hooks/use-election-data";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function Page() {
  const { data: hourlyVotes = [], isPending: loadingVotes } = useHourlyVotes();
  const { data: alerts = [], isPending: loadingAlerts } = useAiAlerts();

  if (loadingVotes || loadingAlerts) return <PageLoader />;

  const predict = hourlyVotes.map((h) => ({ ...h, predicted: Math.round(h.baseline * 1.05) }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">AI Monitoring</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time fraud detection and analytics.</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5">
        <h2 className="text-base font-semibold mb-4">Vote Velocity</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={hourlyVotes}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="hour" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip />
            <Legend />
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" label="Baseline" />
            <Line type="monotone" dataKey="votes" stroke="#6C63FF" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-semibold mb-4">IP Clustering</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left p-2">Subnet</th><th className="text-left p-2">Sessions</th><th className="text-left p-2">Status</th></tr></thead>
            <tbody>
              {[
                { sub: "192.168.10.x/24", n: 47, flag: true },
                { sub: "192.168.11.x/24", n: 22, flag: false },
                { sub: "172.20.5.x/24", n: 14, flag: false },
              ].map((r) => (
                <tr key={r.sub} className={r.flag ? "bg-destructive/5" : ""}>
                  <td className="p-2 font-mono text-xs">{r.sub}</td>
                  <td className="p-2">{r.n}</td>
                  <td className="p-2">{r.flag ? <Badge className="bg-destructive text-white">Flagged</Badge> : <Badge variant="outline">Normal</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-card rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-semibold mb-4">Behavioral Alerts</h2>
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.detail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={a.severity === "HIGH" ? "bg-destructive text-white" : "bg-warning text-warning-foreground"}>{a.severity}</Badge>
                  <Button size="sm" variant="outline">Resolve</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5">
        <h2 className="text-base font-semibold mb-4">Turnout: Predicted vs Actual</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={predict}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="hour" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip /><Legend />
            <Line type="monotone" dataKey="predicted" stroke="#cbd5e1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="votes" stroke="#1F3A6E" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/ai-monitoring")({ component: Page });
