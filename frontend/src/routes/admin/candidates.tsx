import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates } from "@/hooks/use-election-data";
import { useQueryClient } from "@tanstack/react-query";
import { updateCandidateStatus } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { toast } from "sonner";

const STATUS_FILTERS = ["All", "Pending", "Under Review", "Approved", "Rejected"];

function Page() {
  const { data: candidates = [], isPending } = useCandidates();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");
  const [reject, setReject] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewCandidate, setPreviewCandidate] = useState<any | null>(null);

  if (isPending) return <PageLoader />;

  const list = candidates.filter(
    (c) => (filter === "All" || c.status === filter) &&
      ((c.full_name || "").toLowerCase().includes(q.toLowerCase()) || 
       (c.college_email || "").toLowerCase().includes(q.toLowerCase()))
  );

  async function handleApprove(candidateId: string, name: string) {
    setActionLoading(candidateId);
    try {
      await updateCandidateStatus(candidateId, "APPROVED");
      toast.success(`${name} approved successfully`);
      await queryClient.invalidateQueries({ queryKey: ["candidates"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to approve candidate");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRejectConfirm() {
    if (!reject) return;
    setActionLoading(reject);
    try {
      await updateCandidateStatus(reject, "REJECTED", reason);
      toast.success("Application rejected successfully");
      await queryClient.invalidateQueries({ queryKey: ["candidates"] });
      setReject(null);
      setReason("");
    } catch (err: any) {
      toast.error(err.message || "Failed to reject candidate");
    } finally {
      setActionLoading(null);
    }
  }

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
              <th className="p-4">Name</th>
              <th className="p-4">Email</th>
              <th className="p-4">Mobile</th>
              <th className="p-4">Position</th>
              <th className="p-4">Department</th>
              <th className="p-4">Sem</th>
              <th className="p-4">Remarks</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.candidate_id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-4 font-medium">{c.full_name}</td>
                <td className="p-4 text-xs text-muted-foreground">{c.college_email}</td>
                <td className="p-4 text-xs">{c.mobile_number}</td>
                <td className="p-4">{c.position}</td>
                <td className="p-4">{c.department}</td>
                <td className="p-4">{c.semester}</td>
                <td className="p-4 text-xs max-w-[150px] truncate" title={c.admin_remarks || ""}>{c.admin_remarks || "—"}</td>
                <td className="p-4">
                  <Badge 
                    className={
                      c.status === "Approved" 
                        ? "bg-success text-white" 
                        : c.status === "Rejected" 
                        ? "bg-destructive text-white" 
                        : c.status === "Under Review"
                        ? "bg-[#6C63FF]/20 text-[#6C63FF]"
                        : "bg-warning text-warning-foreground"
                    }
                  >
                    {c.status}
                  </Badge>
                </td>
                <td className="p-4">
                  <div className="flex gap-1">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setPreviewCandidate(c)}
                      disabled={!!actionLoading}
                    >
                      Preview
                    </Button>
                    <Button 
                      size="sm" 
                      className="bg-success text-white hover:bg-success/90" 
                      onClick={() => handleApprove(c.candidate_id, c.full_name)}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === c.candidate_id ? "..." : "Approve"}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setReject(c.candidate_id)}
                      disabled={!!actionLoading}
                    >
                      Reject
                    </Button>
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
            <Button variant="outline" onClick={() => setReject(null)} disabled={!!actionLoading}>Cancel</Button>
            <Button 
              disabled={!reason.trim() || !!actionLoading} 
              className="bg-destructive text-white hover:bg-destructive/90" 
              onClick={handleRejectConfirm}
            >
              {actionLoading === reject ? "Confirming..." : "Confirm Reject"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Candidate Preview Modal */}
      <Dialog open={!!previewCandidate} onOpenChange={(b) => !b && setPreviewCandidate(null)}>
        <DialogContent className="max-w-md p-6 rounded-2xl border border-border/80 bg-card">
          {previewCandidate && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 border-b border-border/40 pb-3">
                <img 
                  src={previewCandidate.party_symbol_url || "https://api.dicebear.com/7.x/identicon/svg?seed=symbol"} 
                  alt="Party Symbol" 
                  className="h-12 w-12 rounded-xl bg-muted p-1 border border-border" 
                />
                <div>
                  <DialogTitle className="text-lg font-bold">{previewCandidate.full_name}</DialogTitle>
                  <p className="text-xs text-muted-foreground">{previewCandidate.college_email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40">
                  <span className="text-muted-foreground block font-medium">Position</span>
                  <span className="font-bold text-foreground mt-0.5 block">{previewCandidate.position}</span>
                </div>
                <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40">
                  <span className="text-muted-foreground block font-medium">Department</span>
                  <span className="font-bold text-foreground mt-0.5 block">{previewCandidate.department} (Sem {previewCandidate.semester})</span>
                </div>
                <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40">
                  <span className="text-muted-foreground block font-medium">Mobile Contact</span>
                  <span className="font-bold text-foreground mt-0.5 block">{previewCandidate.mobile_number}</span>
                </div>
                <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40">
                  <span className="text-muted-foreground block font-medium">Applied On</span>
                  <span className="font-bold text-foreground mt-0.5 block">
                    {previewCandidate.applied_at ? new Date(previewCandidate.applied_at).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>

              <div className="space-y-1 bg-muted/20 border border-border/40 p-4 rounded-xl">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">Candidate Manifesto</span>
                  {previewCandidate.manifesto_status && (
                    <Badge variant="outline" className="text-[10px]">{previewCandidate.manifesto_status}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground italic leading-relaxed mt-1 whitespace-pre-wrap">
                  "{previewCandidate.manifesto || "No manifesto submitted."}"
                </p>
                {previewCandidate.manifesto_status === "Pending Review" && (
                  <p className="text-[10px] text-warning-foreground mt-2">
                    Approve this manifesto under Admin → Manifesto Approval.
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90 text-xs font-semibold px-4" onClick={() => setPreviewCandidate(null)}>
                  Close Preview
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/admin/candidates")({ component: Page });

