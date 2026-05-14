import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CANDIDATES } from "@/lib/mock";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { toast } from "sonner";

const STATUS_FILTERS = ["All", "Pending", "Under Review", "Approved", "Rejected"];

function Page() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");
  const [reject, setReject] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const list = CANDIDATES.filter(
    (c) => (filter === "All" || c.status === filter) &&
      (c.name.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Manage Candidates</h1>
        <p className="text-sm text-muted-foreground mt-1">Approve, reject, or review applications.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="pl-9" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap ${filter === s ? "bg-[#1F3A6E] text-white" : "bg-muted"}`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Position</th>
              <th className="p-4">Department</th><th className="p-4">Sem</th><th className="p-4">Party</th>
              <th className="p-4">Payment</th><th className="p-4">Status</th><th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-4 font-medium">{c.name}</td>
                <td className="p-4 text-xs text-muted-foreground">{c.email}</td>
                <td className="p-4">{c.position}</td>
                <td className="p-4">{c.department}</td>
                <td className="p-4">{c.semester}</td>
                <td className="p-4 text-xs">{c.party}</td>
                <td className="p-4"><Badge variant={c.payment === "Paid" ? "default" : "outline"}>{c.payment}</Badge></td>
                <td className="p-4"><Badge className={c.status === "Approved" ? "bg-success text-white" : c.status === "Rejected" ? "bg-destructive text-white" : "bg-warning text-warning-foreground"}>{c.status}</Badge></td>
                <td className="p-4">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost">Preview</Button>
                    <Button size="sm" className="bg-success text-white hover:bg-success/90" onClick={() => toast.success(`${c.name} approved`)}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => setReject(c.id)}>Reject</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!reject} onOpenChange={(b) => !b && setReject(null)}>
        <DialogContent>
          <DialogTitle>Reject Application</DialogTitle>
          <p className="text-sm text-muted-foreground">Provide a reason — this will be shown to the candidate.</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection..." className="w-full h-28 p-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setReject(null)}>Cancel</Button>
            <Button disabled={!reason.trim()} className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { toast.success("Application rejected"); setReject(null); setReason(""); }}>Confirm Reject</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/admin/candidates")({ component: Page });
