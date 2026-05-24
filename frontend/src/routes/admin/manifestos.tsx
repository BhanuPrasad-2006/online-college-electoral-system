import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/PageLoader";
import { fetchManifestosForAdmin, reviewManifesto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const FILTERS = ["All", "pending", "approved", "rejected", "draft"];

function Page() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [preview, setPreview] = useState<any | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data: items = [], isPending } = useQuery({
    queryKey: ["admin-manifestos", filter],
    queryFn: () => fetchManifestosForAdmin(filter === "All" ? undefined : filter),
  });

  async function handleApprove(manifestoId: string, name: string) {
    setLoadingId(manifestoId);
    try {
      await reviewManifesto(manifestoId, "approved");
      toast.success(`Manifesto for ${name} approved — visible to voters`);
      await queryClient.invalidateQueries({ queryKey: ["admin-manifestos"] });
      await queryClient.invalidateQueries({ queryKey: ["candidates"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to approve");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleRejectConfirm() {
    if (!rejectId) return;
    setLoadingId(rejectId);
    try {
      await reviewManifesto(rejectId, "rejected", reason);
      toast.success("Manifesto rejected");
      await queryClient.invalidateQueries({ queryKey: ["admin-manifestos"] });
      setRejectId(null);
      setReason("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to reject");
    } finally {
      setLoadingId(null);
    }
  }

  if (isPending) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Manifesto Approval</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review candidate manifestos. Only approved manifestos are visible to voters.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap capitalize ${
              filter === f ? "bg-[#1F3A6E] text-white" : "bg-muted"
            }`}
          >
            {f === "All" ? "All" : f}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="p-4">Candidate</th>
              <th className="p-4">Position</th>
              <th className="p-4">Candidate status</th>
              <th className="p-4">Manifesto status</th>
              <th className="p-4">Submitted</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No manifestos in this category.
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.manifesto_id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-4 font-medium">{m.full_name}</td>
                  <td className="p-4">{m.position}</td>
                  <td className="p-4">{m.candidate_status}</td>
                  <td className="p-4">
                    <Badge
                      className={
                        m.manifesto_status === "Approved"
                          ? "bg-success text-white"
                          : m.manifesto_status === "Rejected"
                            ? "bg-destructive text-white"
                            : m.manifesto_status === "Pending Review"
                              ? "bg-warning text-warning-foreground"
                              : "bg-muted"
                      }
                    >
                      {m.manifesto_status}
                    </Badge>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">
                    {m.submitted_at ? new Date(m.submitted_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPreview(m)}>
                        Read
                      </Button>
                      {m.manifesto_status === "Pending Review" && (
                        <>
                          <Button
                            size="sm"
                            className="bg-success text-white hover:bg-success/90"
                            disabled={!!loadingId}
                            onClick={() => handleApprove(m.manifesto_id, m.full_name)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!loadingId}
                            onClick={() => setRejectId(m.manifesto_id)}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!preview} onOpenChange={(b) => !b && setPreview(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          {preview && (
            <>
              <DialogTitle>{preview.full_name} — Manifesto</DialogTitle>
              <p className="text-xs text-muted-foreground">{preview.position} · {preview.department}</p>
              <p className="text-sm whitespace-pre-wrap mt-4 leading-relaxed">{preview.content}</p>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectId} onOpenChange={(b) => !b && setRejectId(null)}>
        <DialogContent>
          <DialogTitle>Reject manifesto</DialogTitle>
          <p className="text-sm text-muted-foreground">The candidate will see your remarks and can revise and resubmit.</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection..."
            className="w-full h-28 p-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button
              className="bg-destructive text-white"
              disabled={!reason.trim() || !!loadingId}
              onClick={handleRejectConfirm}
            >
              Confirm reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/admin/manifestos")({ component: Page });
