import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/PageLoader";
import { fetchAdminParties, reviewPartyStatus } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ReconfirmPasswordModal } from "@/components/ReconfirmPasswordModal";
import { Search, Building2, Eye, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_FILTERS = ["All", "Pending", "Approved", "Rejected"];

function Page() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewParty, setPreviewParty] = useState<any | null>(null);
  const [reconfirmOpen, setReconfirmOpen] = useState(false);
  const [reconfirmPartyId, setReconfirmPartyId] = useState<string | null>(null);
  const [reconfirmAction, setReconfirmAction] = useState<"approve" | "reject" | null>(null);

  const { data: parties = [], isPending } = useQuery({
    queryKey: ["admin-parties"],
    queryFn: () => fetchAdminParties(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });

  if (isPending) return <PageLoader />;

  const list = parties.filter(
    (p: any) =>
      (filter === "All" || p.status === filter.toUpperCase()) &&
      ((p.name || "").toLowerCase().includes(q.toLowerCase()) ||
        (p.slogan || "").toLowerCase().includes(q.toLowerCase())),
  );

  async function handleApprove(partyId: string, name: string) {
    setActionLoading(partyId);
    try {
      await reviewPartyStatus(partyId, "APPROVED");
      toast.success(`Party "${name}" approved successfully`);
      await queryClient.invalidateQueries({ queryKey: ["admin-parties"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to approve party");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRejectConfirm() {
    if (!rejectId) return;
    setActionLoading(rejectId);
    try {
      await reviewPartyStatus(rejectId, "REJECTED", reason);
      toast.success("Party application rejected successfully");
      await queryClient.invalidateQueries({ queryKey: ["admin-parties"] });
      setRejectId(null);
      setReason("");
    } catch (err: any) {
      toast.error(err.message || "Failed to reject party");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Party Applications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review, approve, or reject candidate party applications.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by party name or slogan"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap font-medium transition-all ${
                filter === s ? "bg-[#1F3A6E] text-white" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border/40 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border/40">
              <th className="p-4">Logo</th>
              <th className="p-4">Party Name</th>
              <th className="p-4">Slogan</th>
              <th className="p-4">Leader / Founder</th>
              <th className="p-4">Members Count</th>
              <th className="p-4">Remarks</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Building2 className="h-8 w-8 text-muted-foreground/60" />
                    <span>No party applications found.</span>
                  </div>
                </td>
              </tr>
            ) : (
              list.map((p: any) => {
                const leaderMember = p.members?.find((m: any) => m.is_leader);
                const leaderName = leaderMember ? leaderMember.full_name : "Unknown Leader";

                return (
                  <tr key={p.party_id} className="border-b border-border/40 last:border-0 hover:bg-muted/10">
                    <td className="p-4">
                      <img
                        src={p.logo_url || "https://api.dicebear.com/7.x/identicon/svg?seed=" + p.name}
                        alt={p.name}
                        className="h-10 w-10 rounded-lg object-contain bg-muted border border-border/40 p-1"
                      />
                    </td>
                    <td className="p-4 font-semibold text-foreground">{p.name}</td>
                    <td className="p-4 text-xs italic text-muted-foreground max-w-[200px] truncate" title={p.slogan || ""}>
                      {p.slogan || "—"}
                    </td>
                    <td className="p-4 text-xs font-medium">{leaderName}</td>
                    <td className="p-4 text-xs font-medium">{p.members?.length || 0}</td>
                    <td className="p-4 text-xs max-w-[150px] truncate" title={p.admin_remarks || ""}>
                      {p.admin_remarks || "—"}
                    </td>
                    <td className="p-4">
                      <Badge
                        className={
                          p.status === "APPROVED"
                            ? "bg-success text-white"
                            : p.status === "REJECTED"
                              ? "bg-destructive text-white"
                              : "bg-warning text-warning-foreground"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPreviewParty(p)}
                          disabled={!!actionLoading}
                          className="flex items-center gap-1.5"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                        {p.status === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              className="bg-success text-white hover:bg-success/90 flex items-center gap-1.5"
                              onClick={() => {
                                setReconfirmPartyId(p.party_id);
                                setReconfirmAction("approve");
                                setReconfirmOpen(true);
                              }}
                              disabled={!!actionLoading}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              {actionLoading === p.party_id ? "..." : "Approve"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive text-destructive hover:bg-destructive/10 flex items-center gap-1.5"
                              onClick={() => {
                                setReconfirmPartyId(p.party_id);
                                setReconfirmAction("reject");
                                setReconfirmOpen(true);
                              }}
                              disabled={!!actionLoading}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Reject Remarks Modal */}
      <Dialog open={!!rejectId} onOpenChange={(b) => !b && setRejectId(null)}>
        <DialogContent className="max-w-md p-6 rounded-2xl border border-border/80 bg-card">
          <DialogTitle className="text-lg font-bold">Reject Party Application</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Provide a reason for rejection. This remark will be visible to the candidates.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection..."
            className="w-full h-28 p-3 mt-3 border border-border/80 rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#1F3A6E] text-foreground"
          />
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setRejectId(null)} disabled={!!actionLoading}>
              Cancel
            </Button>
            <Button
              disabled={!reason.trim() || !!actionLoading}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleRejectConfirm}
            >
              {actionLoading === rejectId ? "Confirming..." : "Confirm Reject"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Party Preview Modal */}
      <Dialog open={!!previewParty} onOpenChange={(b) => !b && setPreviewParty(null)}>
        <DialogContent className="max-w-xl p-6 rounded-2xl border border-border/80 bg-card">
          {previewParty && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 border-b border-border/40 pb-4">
                <img
                  src={previewParty.logo_url || "https://api.dicebear.com/7.x/identicon/svg?seed=" + previewParty.name}
                  alt={previewParty.name}
                  className="h-16 w-16 rounded-xl object-contain bg-muted border border-border/40 p-2"
                />
                <div>
                  <DialogTitle className="text-xl font-bold text-foreground">
                    {previewParty.name}
                  </DialogTitle>
                  <p className="text-xs italic text-muted-foreground mt-1">
                    "{previewParty.slogan || "No slogan provided"}"
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-muted/30 p-3 rounded-xl border border-border/40">
                  <span className="text-muted-foreground block font-medium">Status</span>
                  <Badge
                    className={`mt-1 ${
                      previewParty.status === "APPROVED"
                        ? "bg-success text-white"
                        : previewParty.status === "REJECTED"
                          ? "bg-destructive text-white"
                          : "bg-warning text-warning-foreground"
                    }`}
                  >
                    {previewParty.status}
                  </Badge>
                </div>
                <div className="bg-muted/30 p-3 rounded-xl border border-border/40">
                  <span className="text-muted-foreground block font-medium">Remarks</span>
                  <span className="font-semibold text-foreground mt-1 block truncate" title={previewParty.admin_remarks || ""}>
                    {previewParty.admin_remarks || "No remarks"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 bg-muted/20 border border-border/40 p-4 rounded-xl">
                <span className="text-xs font-semibold text-foreground block">Manifesto</span>
                <p className="text-xs text-muted-foreground italic leading-relaxed whitespace-pre-wrap">
                  {previewParty.manifesto || "No manifesto submitted."}
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-foreground block">Party Members ({previewParty.members?.length || 0})</span>
                <div className="max-h-[150px] overflow-y-auto border border-border/40 rounded-xl divide-y divide-border/40">
                  {previewParty.members?.length > 0 ? (
                    previewParty.members.map((member: any) => (
                      <div key={member.candidate_id} className="p-3 flex items-center justify-between text-xs hover:bg-muted/20">
                        <div>
                          <span className="font-semibold text-foreground">{member.full_name}</span>
                          <span className="text-muted-foreground block text-[10px]">{member.department || "General"}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium">{member.position || "Member"}</span>
                          {member.is_leader && (
                            <Badge className="ml-2 bg-[#1F3A6E]/20 text-[#1F3A6E] dark:text-blue-400 text-[10px]">Leader</Badge>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-muted-foreground text-xs">No members assigned yet.</div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
                <Button variant="outline" onClick={() => setPreviewParty(null)}>
                  Close
                </Button>
                {previewParty.status === "PENDING" && (
                  <>
                    <Button
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setReconfirmPartyId(previewParty.party_id);
                        setReconfirmAction("reject");
                        setReconfirmOpen(true);
                        setPreviewParty(null);
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      className="bg-success text-white hover:bg-success/90"
                      onClick={() => {
                        setReconfirmPartyId(previewParty.party_id);
                        setReconfirmAction("approve");
                        setReconfirmOpen(true);
                        setPreviewParty(null);
                      }}
                    >
                      Approve Party
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Password Reconfirmation Modal */}
      <ReconfirmPasswordModal
        open={reconfirmOpen}
        onOpenChange={(o) => {
          setReconfirmOpen(o);
          if (!o) {
            setReconfirmPartyId(null);
            setReconfirmAction(null);
          }
        }}
        title={reconfirmAction === "approve" ? "Approve Party Application" : "Reject Party Application"}
        description={
          reconfirmAction === "approve"
            ? "Approving a party is a sensitive action. Please confirm your password to proceed."
            : "Rejecting a party is a sensitive action. Please confirm your password to proceed."
        }
        actionLabel={reconfirmAction === "approve" ? "Confirm Approve" : "Confirm Reject"}
        onVerified={async () => {
          if (!reconfirmPartyId || !reconfirmAction) return;
          const name = parties.find((p: any) => p.party_id === reconfirmPartyId)?.name || "";
          if (reconfirmAction === "approve") {
            await handleApprove(reconfirmPartyId, name);
          } else {
            setRejectId(reconfirmPartyId);
          }
          setReconfirmPartyId(null);
          setReconfirmAction(null);
        }}
      />
    </div>
  );
}

export const Route = createFileRoute("/admin/parties")({ component: Page });
