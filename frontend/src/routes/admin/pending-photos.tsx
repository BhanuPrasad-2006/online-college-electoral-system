import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPendingPhotos,
  approvePendingPhoto,
  rejectPendingPhoto,
  resolveApiAssetUrl,
  resolveVoterPhotoUrl,
  fetchReuploadRequests,
  requestPhotoReupload,
  clearReuploadRequest,
  fetchVotersForAdmin,
} from "@/lib/api";
import { PageLoader } from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  CheckCircle,
  XCircle,
  Eye,
  ArrowRight,
  Camera,
  AlertTriangle,
  Clock,
  Search,
} from "lucide-react";
import { toast } from "sonner";

function Page() {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewVoter, setReviewVoter] = useState<any | null>(null);
  const [tab, setTab] = useState<"pending" | "requests" | "enrolled">("pending");
  const [reuploadDialogVoter, setReuploadDialogVoter] = useState<any | null>(null);
  const [enrolledSearch, setEnrolledSearch] = useState("");

  const { data: pendingList = [], isPending: pendingLoading } = useQuery({
    queryKey: ["pending-photos"],
    queryFn: fetchPendingPhotos,
  });

  const { data: reuploadList = [], isPending: requestsLoading } = useQuery({
    queryKey: ["reupload-requests"],
    queryFn: fetchReuploadRequests,
  });

  const { data: votersList = [], isPending: votersLoading } = useQuery({
    queryKey: ["voters-list"],
    queryFn: fetchVotersForAdmin,
  });

  const enrolledList = useMemo(() => {
    return votersList.filter(
      (v: any) =>
        v.face_enrolled &&
        ((v.full_name || "").toLowerCase().includes(enrolledSearch.toLowerCase()) ||
          (v.college_email || "").toLowerCase().includes(enrolledSearch.toLowerCase()) ||
          (v.student_id || "").toLowerCase().includes(enrolledSearch.toLowerCase())),
    );
  }, [votersList, enrolledSearch]);

  if (pendingLoading && requestsLoading && (tab === "enrolled" ? votersLoading : false)) return <PageLoader />;

  async function handleApprove(voterId: string, name: string) {
    setActionLoading(voterId);
    try {
      await approvePendingPhoto(voterId);
      toast.success(`Photo approved for ${name}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pending-photos"] }),
        queryClient.invalidateQueries({ queryKey: ["reupload-requests"] }),
      ]);
    } catch (err: any) {
      toast.error(err.message || "Failed to approve photo");
    } finally {
      setActionLoading(null);
      setReviewVoter(null);
    }
  }

  async function handleReject(voterId: string, name: string) {
    setActionLoading(voterId);
    try {
      await rejectPendingPhoto(voterId);
      toast.success(`Photo update rejected for ${name}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pending-photos"] }),
        queryClient.invalidateQueries({ queryKey: ["reupload-requests"] }),
      ]);
    } catch (err: any) {
      toast.error(err.message || "Failed to reject photo");
    } finally {
      setActionLoading(null);
      setReviewVoter(null);
    }
  }

  async function handleRequestReupload(voterId: string, name: string) {
    setActionLoading("reupload-" + voterId);
    try {
      await requestPhotoReupload(voterId);
      toast.success(`Re-upload requested for ${name}. Email notification sent.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pending-photos"] }),
        queryClient.invalidateQueries({ queryKey: ["reupload-requests"] }),
      ]);
    } catch (err: any) {
      toast.error(err.message || "Failed to request re-upload");
    } finally {
      setActionLoading(null);
      setReuploadDialogVoter(null);
    }
  }

  async function handleClearRequest(voterId: string, name: string) {
    setActionLoading("clear-" + voterId);
    try {
      await clearReuploadRequest(voterId);
      toast.success(`Re-upload request cleared for ${name}`);
      await queryClient.invalidateQueries({ queryKey: ["reupload-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to clear request");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Photo Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review voter-submitted photos and manage re-upload requests.
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b border-border/60 pb-2">
        <button
          onClick={() => setTab("pending")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === "pending"
              ? "bg-[#D9A441]/10 text-[#D9A441] border-b-2 border-[#0F8A5F]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Pending Reviews
          {pendingList.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-[#D9A441]/20 text-[#D9A441] rounded-full">{pendingList.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab("requests")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === "requests"
              ? "bg-[#D9A441]/10 text-[#D9A441] border-b-2 border-[#0F8A5F]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Re-upload Requests
          {reuploadList.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-warning/20 text-warning-foreground rounded-full">{reuploadList.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab("enrolled")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === "enrolled"
              ? "bg-[#D9A441]/10 text-[#D9A441] border-b-2 border-[#0F8A5F]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Enrolled Photos
          {votersList.filter((v: any) => v.face_enrolled).length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-success/20 text-success rounded-full">
              {votersList.filter((v: any) => v.face_enrolled).length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab: Pending Photo Reviews ── */}
      {tab === "pending" && (
        <>
          {pendingList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Camera className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">No pending photo reviews</h3>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Voter-submitted photo updates will appear here for review.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingList.map((voter: any) => (
                <div key={voter.voter_id} className="bg-card rounded-2xl border border-border/60 p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{voter.full_name}</h3>
                      <p className="text-xs text-muted-foreground">{voter.college_email}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setReviewVoter(voter)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Review
                    </Button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium">Current</p>
                      <div className="aspect-square rounded-xl bg-muted overflow-hidden border border-border/40">
                        {voter.current_image_url ? (
                          <img src={resolveVoterPhotoUrl(voter.voter_id)} alt="Current" className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = "https://api.dicebear.com/7.x/avataaars/svg?seed=current"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                            <Camera className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium">Pending</p>
                      <div className="aspect-square rounded-xl bg-muted overflow-hidden border-2 border-[#0F8A5F]/40 ring-2 ring-[#0F8A5F]/10">
                        {voter.pending_image_url ? (
                          <img src={resolveVoterPhotoUrl(voter.voter_id, true)} alt="Pending" className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = "https://api.dicebear.com/7.x/avataaars/svg?seed=pending"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                            <Camera className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 bg-success text-white hover:bg-success/90"
                      onClick={() => handleApprove(voter.voter_id, voter.full_name)} disabled={!!actionLoading}>
                      {actionLoading === voter.voter_id ? "..." : <><CheckCircle className="h-3.5 w-3.5 mr-1" />Approve</>}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => handleReject(voter.voter_id, voter.full_name)} disabled={!!actionLoading}>
                      <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Re-upload Requests ── */}
      {tab === "requests" && (
        <>
          {reuploadList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Camera className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">No re-upload requests</h3>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Use the "Request Re-upload" button on a pending photo review or from here to ask a voter to submit a new photo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reuploadList.map((voter: any) => (
                <div key={voter.voter_id} className="bg-card rounded-2xl border border-[#D9A441]/30 p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera className="h-4 w-4 text-[#0F8A5F]" />
                      <div>
                        <h3 className="font-semibold text-sm">{voter.full_name}</h3>
                        <p className="text-xs text-muted-foreground">{voter.college_email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium">Current Photo</p>
                      <div className="aspect-square rounded-xl bg-muted overflow-hidden border border-border/40">
                        {voter.current_image_url ? (
                          <img src={resolveVoterPhotoUrl(voter.voter_id)} alt="Current" className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = "https://api.dicebear.com/7.x/avataaars/svg?seed=current"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                            <Camera className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium">Status</p>
                      <div className="aspect-square rounded-xl bg-muted overflow-hidden flex items-center justify-center">
                        {voter.has_submitted_new_photo ? (
                          <div className="text-center">
                            <CheckCircle className="h-8 w-8 text-success mx-auto" />
                            <p className="text-[11px] text-success font-medium mt-1">Submitted</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <Clock className="h-8 w-8 text-warning mx-auto" />
                            <p className="text-[11px] text-warning-foreground font-medium mt-1">Awaiting</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!voter.has_submitted_new_photo && (
                      <Button size="sm" className="flex-1 bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90"
                        onClick={() => setReuploadDialogVoter(voter)} disabled={!!actionLoading}>
                        {actionLoading === "reupload-" + voter.voter_id ? "..." : <><Camera className="h-3.5 w-3.5 mr-1" />Resend Request</>}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="flex-1"
                      onClick={() => handleClearRequest(voter.voter_id, voter.full_name)} disabled={!!actionLoading}>
                      {actionLoading === "clear-" + voter.voter_id ? "..." : "Clear Request"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Enrolled Photos ── */}
      {tab === "enrolled" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search enrolled voters..."
              value={enrolledSearch}
              onChange={(e) => setEnrolledSearch(e.target.value)}
              className="h-9 font-medium"
            />
          </div>

          {enrolledList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Camera className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">No enrolled photos found</h3>
              <p className="text-sm text-muted-foreground/60 mt-1">
                {enrolledSearch ? "No matches found for your search query." : "No voters currently have a face photo enrolled."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {enrolledList.map((voter: any) => (
                <div key={voter.voter_id} className="bg-card rounded-2xl border border-border/60 p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate">
                        <h3 className="font-semibold text-sm truncate">{voter.full_name}</h3>
                        <p className="text-xs text-muted-foreground truncate">{voter.college_email}</p>
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setReviewVoter({
                        voter_id: voter.voter_id,
                        full_name: voter.full_name,
                        college_email: voter.college_email,
                        current_image_url: voter.reference_image_url,
                        has_current_photo: true
                      })}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                    </div>

                    <div className="flex items-center justify-center py-3">
                      <div className="w-28 aspect-[3/4] rounded-xl bg-muted overflow-hidden border border-border/60 shadow-sm relative group">
                        {voter.reference_image_url ? (
                          <img src={resolveVoterPhotoUrl(voter.voter_id)} alt={voter.full_name} className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = "https://api.dicebear.com/7.x/avataaars/svg?seed=" + voter.full_name; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                            <Camera className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border/40">
                    <Button size="sm" variant="outline" className="w-full text-[#0F8A5F] border-[#D9A441]/30 hover:bg-[#0F8A5F]/10"
                      onClick={() => setReuploadDialogVoter(voter)} disabled={!!actionLoading}>
                      <Camera className="h-3.5 w-3.5 mr-1" />Request Re-upload
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Side-by-side Review Dialog ── */}
      <Dialog open={!!reviewVoter} onOpenChange={(b) => !b && setReviewVoter(null)}>
        <DialogContent className="max-w-2xl p-6">
          {reviewVoter && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#1F2937] to-[#0F8A5F] flex items-center justify-center text-white font-bold text-sm">
                  {reviewVoter.full_name?.charAt(0) || "?"}
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold">{reviewVoter.full_name}</DialogTitle>
                  <p className="text-xs text-muted-foreground">{reviewVoter.college_email}</p>
                </div>
              </div>

              <div className={reviewVoter.pending_image_url ? "grid grid-cols-2 gap-6" : "flex justify-center"}>
                <div className={reviewVoter.pending_image_url ? "space-y-2" : "space-y-2 w-full max-w-[280px]"}>
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">
                      {reviewVoter.pending_image_url ? "Current Photo" : "Active Reference Photo"}
                    </span>
                    {!reviewVoter.has_current_photo && <Badge variant="outline" className="text-[10px]">No photo</Badge>}
                  </div>
                  <div className="aspect-[3/4] rounded-xl bg-muted overflow-hidden border border-border/60">
                    {reviewVoter.current_image_url ? (
                      <img src={resolveVoterPhotoUrl(reviewVoter.voter_id)} alt="Current" className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = "https://api.dicebear.com/7.x/avataaars/svg?seed=current"; }} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-2">
                        <Camera className="h-8 w-8" />
                        <p className="text-xs">No current photo</p>
                      </div>
                    )}
                  </div>
                </div>

                {reviewVoter.pending_image_url && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Camera className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Pending Photo</span>
                    </div>
                    <div className="aspect-[3/4] rounded-xl bg-muted overflow-hidden border-2 border-[#0F8A5F]/40 ring-2 ring-[#0F8A5F]/10">
                      <img
                        src={resolveVoterPhotoUrl(reviewVoter.voter_id, true)}
                        alt="Pending"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = "https://api.dicebear.com/7.x/avataaars/svg?seed=pending"; }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setReviewVoter(null)}>
                  Close
                </Button>
                <Button size="sm" variant="outline" className="text-[#0F8A5F] border-[#D9A441]/30 hover:bg-[#0F8A5F]/10"
                  onClick={() => { setReviewVoter(null); handleRequestReupload(reviewVoter.voter_id, reviewVoter.full_name); }}
                  disabled={!!actionLoading}>
                  <Camera className="h-3.5 w-3.5 mr-1" />Request Re-upload
                </Button>
                {reviewVoter.pending_image_url && (
                  <>
                    <Button
                      size="sm"
                      className="bg-success text-white hover:bg-success/90"
                      onClick={() => handleApprove(reviewVoter.voter_id, reviewVoter.full_name)}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === reviewVoter.voter_id ? "..." : (<><CheckCircle className="h-3.5 w-3.5 mr-1" />Approve</>)}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => handleReject(reviewVoter.voter_id, reviewVoter.full_name)}
                      disabled={!!actionLoading}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Re-upload Request Confirm Dialog ── */}
      <Dialog open={!!reuploadDialogVoter} onOpenChange={(b) => !b && setReuploadDialogVoter(null)}>
        <DialogContent className="max-w-md p-6">
          {reuploadDialogVoter && (
            <div className="space-y-4">
              <DialogTitle className="text-lg font-bold">Request Photo Re-upload</DialogTitle>
              <p className="text-sm text-muted-foreground">
                This will send an email notification to <strong>{reuploadDialogVoter.full_name}</strong> ({reuploadDialogVoter.college_email})
                asking them to upload a new profile photo. Their pending photo (if any) will be cleared.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setReuploadDialogVoter(null)}>
                  Cancel
                </Button>
                <Button size="sm" className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90"
                  onClick={() => handleRequestReupload(reuploadDialogVoter.voter_id, reuploadDialogVoter.full_name)}
                  disabled={!!actionLoading}>
                  {actionLoading === "reupload-" + reuploadDialogVoter.voter_id ? "..." : "Send Request"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/admin/pending-photos")({ component: Page });

