import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useAuditLogs } from "@/hooks/use-election-data";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

function Page() {
  const { data: logs = [], isPending } = useAuditLogs();
  const [q, setQ] = useState("");
  const [type, setType] = useState("ALL");
  const types = ["ALL", "LOGIN", "VOTE_CAST", "CANDIDATE_APPROVED", "OTP_REQUESTED", "ADMIN_ACTION"];

  if (isPending) return <PageLoader />;

  const list = logs.filter((l) => (type === "ALL" || l.event === type) && (l.actor.includes(q) || l.ip.includes(q)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">Read-only system audit trail.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by actor or IP" className="pl-9" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {types.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap ${type === t ? "bg-[#1F3A6E] text-white" : "bg-muted"}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="bg-card rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead><tr className="text-xs text-muted-foreground border-b text-left">
            <th className="p-3">Timestamp</th><th className="p-3">Event</th><th className="p-3">Actor</th><th className="p-3">IP</th><th className="p-3">Description</th>
          </tr></thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id} className={cn("border-b last:border-0",
                l.level === "security" && "bg-destructive/5",
                l.level === "warning" && "bg-warning/5",
                l.level === "success" && "")}>
                <td className="p-3 font-mono text-xs">{l.ts}</td>
                <td className="p-3"><span className="font-mono text-xs">{l.event}</span></td>
                <td className="p-3 text-xs">{l.actor}</td>
                <td className="p-3 font-mono text-xs">{l.ip}</td>
                <td className="p-3 text-xs">{l.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/audit-logs")({ component: Page });
