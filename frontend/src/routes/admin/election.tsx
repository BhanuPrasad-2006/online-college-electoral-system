import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Users, Lock, Unlock, CheckCircle2, ShieldAlert, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { fetchVotersForAdmin, updateVoterPermission, fetchCurrentElection, openVoting, closeVoting, publishResults } from "@/lib/api";

function Page() {
  const [positions, setPositions] = useState(["President", "Vice President", "General Secretary"]);
  const [newPos, setNewPos] = useState("");
  
  // Voter list states
  const [voters, setVoters] = useState<any[]>([]);
  const [loadingVoters, setLoadingVoters] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingVoterId, setUpdatingVoterId] = useState<string | null>(null);

  const [election, setElection] = useState<any>(null);
  const [loadingElection, setLoadingElection] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function loadElection() {
    setLoadingElection(true);
    try {
      const data = await fetchCurrentElection();
      setElection(data);
    } catch (e) {
      console.warn("Failed to fetch current election status from backend:", e);
    } finally {
      setLoadingElection(false);
    }
  }

  async function handleOpenVoting() {
    if (!election) return;
    setUpdatingStatus(true);
    try {
      const res = await openVoting(election.election_id);
      toast.success(res.message || "Voting successfully opened!");
      await loadElection();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to open voting");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleCloseVoting() {
    if (!election) return;
    setUpdatingStatus(true);
    try {
      const res = await closeVoting(election.election_id);
      toast.success(res.message || "Voting successfully closed!");
      await loadElection();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to close voting");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handlePublishResults() {
    if (!election) return;
    setUpdatingStatus(true);
    try {
      const res = await publishResults(election.election_id);
      toast.success(res.message || "Results successfully published!");
      await loadElection();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to publish results");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function loadVoters() {
    setLoadingVoters(true);
    try {
      const data = await fetchVotersForAdmin();
      setVoters(data);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to load voters list");
    } finally {
      setLoadingVoters(false);
    }
  }

  useEffect(() => {
    loadVoters();
    loadElection();
  }, []);

  async function handleTogglePermission(voterId: string, currentPermission: boolean) {
    setUpdatingVoterId(voterId);
    try {
      const nextPermission = !currentPermission;
      const res = await updateVoterPermission(voterId, nextPermission);
      toast.success(res.message);
      
      // Update local state
      setVoters(voters.map(v => v.voter_id === voterId ? { ...v, vote_permission: nextPermission } : v));
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to update voter permission");
    } finally {
      setUpdatingVoterId(null);
    }
  }

  const filteredVoters = voters.filter(v => 
    v.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.student_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.college_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Election Control</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure, operate, and manage voter permissions.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Voter Voting Permission Control Section */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#6C63FF]" />
                  Voter Voting Permissions
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Approve voters to allow them to cast their ballots during the active election.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={loadVoters} disabled={loadingVoters} className="gap-2">
                <RefreshCw className={`h-3.5 w-3.5 ${loadingVoters ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search voters by name, student ID, or email..."
                className="pl-9 h-10 rounded-xl"
              />
            </div>

            {loadingVoters ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <RefreshCw className="h-8 w-8 animate-spin text-[#6C63FF] mb-2" />
                <p className="text-sm">Fetching registered voters...</p>
              </div>
            ) : filteredVoters.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-xl">
                <p className="text-sm text-muted-foreground">No voters found matching your query.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border/60 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/40 text-xs font-semibold text-muted-foreground border-b border-border/60">
                      <th className="p-3">Student Details</th>
                      <th className="p-3">Department</th>
                      <th className="p-3 text-center">Tally Status</th>
                      <th className="p-3 text-center">Voting Permission</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-sm">
                    {filteredVoters.map((v) => (
                      <tr key={v.voter_id} className="hover:bg-muted/35 transition-colors">
                        <td className="p-3">
                          <p className="font-medium text-foreground">{v.full_name}</p>
                          <p className="text-xs text-muted-foreground">{v.student_id} · {v.college_email}</p>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {v.department} <span className="text-xs">({v.year_of_study} Year)</span>
                        </td>
                        <td className="p-3 text-center">
                          {v.has_voted ? (
                            <Badge className="bg-success/15 text-success hover:bg-success/20 border-0 font-medium">Voted</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground border-border font-medium">Not Voted</Badge>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {v.vote_permission ? (
                            <Badge className="bg-[#6C63FF]/15 text-[#6C63FF] hover:bg-[#6C63FF]/20 border-0 font-medium gap-1">
                              <Unlock className="h-3 w-3" />
                              Allowed
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="bg-destructive/15 text-destructive hover:bg-destructive/20 border-0 font-medium gap-1">
                              <Lock className="h-3 w-3" />
                              Blocked
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant={v.vote_permission ? "destructive" : "default"}
                            className={v.vote_permission ? "" : "bg-[#6C63FF] hover:bg-[#6C63FF]/90 text-white"}
                            disabled={updatingVoterId === v.voter_id}
                            onClick={() => handleTogglePermission(v.voter_id, v.vote_permission)}
                          >
                            {updatingVoterId === v.voter_id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : v.vote_permission ? (
                              "Revoke"
                            ) : (
                              "Allow to Vote"
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
            <h2 className="text-base font-semibold">Create / Edit Election</h2>
            <Field label="Election Title"><Input defaultValue="Student Council Election 2025" /></Field>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Positions</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {positions.map((p) => (
                  <Badge key={p} variant="outline" className="gap-1 pr-1">
                    {p}
                    <button onClick={() => setPositions((arr) => arr.filter((x) => x !== p))}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input value={newPos} onChange={(e) => setNewPos(e.target.value)} placeholder="Add position" />
                <Button variant="outline" onClick={() => { if (newPos) { setPositions((p) => [...p, newPos]); setNewPos(""); } }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Registration Opens"><Input type="datetime-local" /></Field>
              <Field label="Registration Closes"><Input type="datetime-local" /></Field>
              <Field label="Voting Opens"><Input type="datetime-local" /></Field>
              <Field label="Voting Closes"><Input type="datetime-local" /></Field>
            </div>
            <Button className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90" onClick={() => toast.success("Election saved")}>Create Election</Button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
            <h2 className="text-base font-semibold">Current Election Status</h2>
            {election ? (
              <div className="grid grid-cols-1 gap-3 text-sm">
                <Row k="Phase" v={<Badge className="bg-[#6C63FF]/15 text-[#6C63FF] border-0">{election.status || "Unknown"}</Badge>} />
                <Row k="Voting opens" v={election.voting_start ? new Date(election.voting_start).toLocaleString() : "Not set"} />
                <Row k="Voting closes" v={election.voting_end ? new Date(election.voting_end).toLocaleString() : "Not set"} />
                <Row k="Approved candidates" v={election.candidates?.length ?? "3"} />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center flex flex-col items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-[#6C63FF] mb-1" />
                Loading election details...
              </div>
            )}
            <div className="flex flex-col gap-2 pt-3">
              <Button 
                variant="outline" 
                onClick={handleOpenVoting} 
                disabled={updatingStatus || !election || election.status === "VOTING_OPEN" || election.status === "CLOSED" || election.status === "RESULTS_PUBLISHED"}
              >
                Open Voting Now
              </Button>
              <Button 
                variant="outline" 
                onClick={handleCloseVoting} 
                disabled={updatingStatus || !election || election.status !== "VOTING_OPEN"}
              >
                Close Voting Now
              </Button>
              <Button 
                className="bg-[#6C63FF] text-white hover:bg-[#6C63FF]/90" 
                onClick={handlePublishResults} 
                disabled={updatingStatus || !election || election.status !== "CLOSED"}
              >
                Initiate Result Computation
              </Button>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs break-all">
              <span className="text-muted-foreground">SHA-256 Integrity Hash: </span>
              {election?.result_integrity_hash || "a3f1e9b87c4d2e1a5f6b9c8d7e2a1f4b3c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between p-3 bg-muted/40 rounded-lg">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

export const Route = createFileRoute("/admin/election")({ component: Page });
