import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/PageLoader";
import { fetchMyParty, updatePartyManifesto, sendPartyInvitation, cancelPartyInvitation, fetchCandidateProfile } from "@/lib/api";
import { PageHeader, SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Users,
  Building2,
  FileText,
  UserPlus,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

function Page() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [invitePosition, setInvitePosition] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const [manifestoText, setManifestoText] = useState("");
  const [isUpdatingManifesto, setIsUpdatingManifesto] = useState(false);
  const [manifestoOpen, setManifestoOpen] = useState(false);

  // Fetch Candidate Profile
  const { data: profile } = useQuery({
    queryKey: ["candidate-profile"],
    queryFn: fetchCandidateProfile,
    staleTime: 30_000,
  });

  // Fetch Party Details
  const { data: party, isPending, isError, error } = useQuery({
    queryKey: ["my-party"],
    queryFn: fetchMyParty,
    staleTime: 10_000,
    retry: false,
  });

  if (isPending) return <PageLoader />;

  if (isError || !party) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold mb-2">No Party Found</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Could not fetch political party details. This might be because you are registered as an Independent candidate or your party is not yet fully approved.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl bg-[#1F3A6E] text-white font-semibold hover:bg-[#1F3A6E]/90 transition-all shadow-md"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const isLeader = profile?.candidate_id === party.leader_candidate_id || party.leader_candidate_id === profile?.user_id;

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setIsInviting(true);
    try {
      await sendPartyInvitation({
        invited_email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        position: invitePosition || undefined,
        message: inviteMessage || undefined,
        invited_usn: "",
      });
      toast.success("Party invitation sent successfully!");
      setInviteEmail("");
      setInvitePosition("");
      setInviteMessage("");
      await queryClient.invalidateQueries({ queryKey: ["my-party"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to send party invitation");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    try {
      await cancelPartyInvitation(inviteId);
      toast.success("Invitation cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["my-party"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel invitation");
    }
  }

  async function handleUpdateManifesto(e: React.FormEvent) {
    e.preventDefault();
    if (!manifestoText.trim()) {
      toast.error("Manifesto content cannot be empty.");
      return;
    }
    setIsUpdatingManifesto(true);
    try {
      await updatePartyManifesto(manifestoText);
      toast.success("Manifesto updated successfully!");
      setManifestoOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["my-party"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update manifesto");
    } finally {
      setIsUpdatingManifesto(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={party.name || "Party Dashboard"}
        subtitle={party.slogan ? `"${party.slogan}"` : "Political Party Portal"}
      />

      {party.status !== "APPROVED" && (
        <div className="bg-warning/10 border border-warning/20 text-warning-foreground rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Party Application Pending Approval</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The political party is currently in <span className="font-semibold">{party.status}</span> status. Admin approval is required before you can send invitations or edit the collective manifesto.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Building2}
          label="Party Name"
          value={<span className="text-lg font-bold truncate max-w-[200px] block">{party.name}</span>}
          delay={100}
        />
        <StatCard
          icon={Users}
          label="Party Members"
          value={<span className="text-lg font-bold">{party.members?.length || 0} Registered</span>}
          delay={150}
        />
        <StatCard
          icon={FileText}
          label="Manifesto Status"
          value={
            <Badge className={party.manifesto ? "bg-success text-white" : "bg-warning text-warning-foreground"}>
              {party.manifesto ? "Configured" : "Missing"}
            </Badge>
          }
          delay={200}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Manifesto & Members */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard>
            <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#6C63FF]" />
                <h2 className="text-base font-semibold">Party Manifesto</h2>
              </div>
              {isLeader && party.status === "APPROVED" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setManifestoText(party.manifesto || "");
                    setManifestoOpen(true);
                  }}
                  className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90 text-xs"
                >
                  <Sparkles className="h-3 w-3 mr-1.5" />
                  Edit Manifesto
                </Button>
              )}
            </div>
            <div className="bg-muted/10 border border-border/40 p-4 rounded-xl">
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap italic">
                {party.manifesto || "No manifesto submitted yet. The party leader can update the manifesto using the edit option."}
              </p>
            </div>
          </SectionCard>

          <SectionCard>
            <div className="flex items-center gap-2 mb-4 border-b border-border/40 pb-3">
              <Users className="h-5 w-5 text-[#6C63FF]" />
              <h2 className="text-base font-semibold">Party Members</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border/40 pb-2">
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Department</th>
                    <th className="pb-2">Role</th>
                    <th className="pb-2">Position Contest</th>
                    <th className="pb-2 text-right">Joined At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {party.members?.map((m: any) => (
                    <tr key={m.candidate_id} className="hover:bg-muted/10">
                      <td className="py-3 font-semibold text-foreground flex items-center gap-1.5">
                        {m.full_name}
                        {m.is_leader && (
                          <Badge className="bg-[#1F3A6E]/20 text-[#1F3A6E] dark:text-blue-400 text-[10px]">Leader</Badge>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground">{m.department || "General"}</td>
                      <td className="py-3 font-medium">{m.role || "Member"}</td>
                      <td className="py-3 text-muted-foreground">{m.position || "Member"}</td>
                      <td className="py-3 text-right text-muted-foreground">
                        {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Right 1 Column: Invite Panels */}
        <div className="space-y-6">
          {isLeader && party.status === "APPROVED" && (
            <SectionCard>
              <div className="flex items-center gap-2 mb-4 border-b border-border/40 pb-3">
                <UserPlus className="h-5 w-5 text-[#6C63FF]" />
                <h2 className="text-base font-semibold">Invite Members</h2>
              </div>
              <form onSubmit={handleSendInvite} className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Voter Email *</label>
                  <Input
                    type="email"
                    required
                    placeholder="student@college.edu.in"
                    className="mt-1"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Role *</label>
                  <select
                    className="w-full mt-1 p-2 bg-background border border-border/80 rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="MEMBER">Member</option>
                    <option value="COORDINATOR">Coordinator</option>
                    <option value="TREASURER">Treasurer</option>
                    <option value="SPOKESPERSON">Spokesperson</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Contesting Position Title</label>
                  <Input
                    type="text"
                    placeholder="e.g. Vice President"
                    className="mt-1"
                    value={invitePosition}
                    onChange={(e) => setInvitePosition(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Message</label>
                  <textarea
                    placeholder="Join our party..."
                    className="w-full mt-1 p-2 bg-background border border-border/80 rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary h-16"
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isInviting || !inviteEmail}
                  className="w-full bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white text-xs py-2 flex items-center justify-center gap-1.5 mt-2"
                >
                  <Send className="h-3 w-3" />
                  {isInviting ? "Sending..." : "Send Invitation"}
                </Button>
              </form>
            </SectionCard>
          )}

          <SectionCard>
            <div className="flex items-center gap-2 mb-4 border-b border-border/40 pb-3">
              <Clock className="h-5 w-5 text-[#6C63FF]" />
              <h2 className="text-base font-semibold">Pending Invitations</h2>
            </div>
            <div className="space-y-3">
              {party.pending_invitations && party.pending_invitations.length > 0 ? (
                party.pending_invitations.map((inv: any) => (
                  <div key={inv.invitation_id} className="p-3 border border-border/40 rounded-xl bg-muted/10 flex flex-col gap-2">
                    <div className="flex justify-between items-start gap-1">
                      <div className="truncate">
                        <span className="font-semibold text-xs text-foreground truncate block">{inv.invited_voter_id}</span>
                        <span className="text-[10px] text-muted-foreground">Role: {inv.role || "Member"}</span>
                      </div>
                      <Badge className="bg-warning text-warning-foreground text-[8px] uppercase">
                        {inv.status}
                      </Badge>
                    </div>
                    {inv.position && (
                      <p className="text-[10px] text-muted-foreground">Position: <span className="font-medium text-foreground">{inv.position}</span></p>
                    )}
                    {isLeader && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelInvite(inv.invitation_id)}
                        className="text-destructive border-destructive/20 hover:bg-destructive/10 text-[10px] py-1 self-end flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        Cancel
                      </Button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No pending invitations.</p>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Edit Manifesto Dialog */}
      <Dialog open={manifestoOpen} onOpenChange={setManifestoOpen}>
        <DialogContent className="max-w-2xl p-6 rounded-2xl border border-border/80 bg-card">
          <DialogTitle className="text-lg font-bold">Edit Party Manifesto</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Update your party's collective statement. This will be visible to all voters on the ballot and candidate lists.
          </p>
          <form onSubmit={handleUpdateManifesto} className="space-y-4 mt-4">
            <textarea
              required
              value={manifestoText}
              onChange={(e) => setManifestoText(e.target.value)}
              placeholder="Enter party manifesto (minimum 50 characters)..."
              className="w-full h-64 p-3 bg-background border border-border/80 rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[#1F3A6E]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setManifestoOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isUpdatingManifesto || manifestoText.length < 50}
                className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
              >
                {isUpdatingManifesto ? "Updating..." : "Update Manifesto"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/candidate/party-dashboard")({ component: Page });
