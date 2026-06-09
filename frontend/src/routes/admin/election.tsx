import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ReconfirmPasswordModal } from "@/components/ReconfirmPasswordModal";
import {
  Plus,
  X,
  Users,
  Lock,
  Unlock,
  RefreshCw,
  Search,
  Edit2,
  Check,
  Building2,
  ChevronDown,
  ChevronUp,
  Eye,
  CheckCircle2,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchVotersForAdmin,
  updateVoterPermission,
  bulkUpdateVoterPermission,
  fetchCurrentElection,
  openVoting,
  closeVoting,
  publishResults,
  setVoterVerificationCode,
  updateElectionDates,
  createElection,
  getCurrentPhase,
  announceElectionSchedule,
  pauseElection,
  resumeElection,
  emergencyStopElection,
  API_BASE_URL,
  getAuthToken,
  getCsrfToken,
  resolveApiAssetUrl,
  resolveVoterPhotoUrl,
  fetchCandidates,
  updateCandidateStatus,
} from "@/lib/api";

function Page() {
  const [positions, setPositions] = useState(["President", "Vice President", "General Secretary"]);
  const [newPos, setNewPos] = useState("");

  // Voter list states
  const [voters, setVoters] = useState<any[]>([]);
  const [loadingVoters, setLoadingVoters] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingVoterId, setUpdatingVoterId] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<string>("All");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({});

  // Verification ID states
  const [editingVoterId, setEditingVoterId] = useState<string | null>(null);
  const [editingIdVal, setEditingIdVal] = useState("");
  const [savingVoterId, setSavingVoterId] = useState<string | null>(null);

  // Face ID upload states
  const [uploadingFaceId, setUploadingFaceId] = useState<string | null>(null);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"voters" | "candidates" | "settings">("voters");

  // Pagination states
  const [voterPage, setVoterPage] = useState(1);
  const [candidatePage, setCandidatePage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    setVoterPage(1);
  }, [selectedDept, searchQuery]);

  // Candidates registry states
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
  const [selectedCandidateStatus, setSelectedCandidateStatus] = useState("All");
  const [actionLoadingCandidateId, setActionLoadingCandidateId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [previewCandidate, setPreviewCandidate] = useState<any | null>(null);
  const [rejectCandidateId, setRejectCandidateId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    setCandidatePage(1);
  }, [selectedCandidateStatus, candidateSearchQuery]);

  const [election, setElection] = useState<any>(null);
  const [loadingElection, setLoadingElection] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [phaseData, setPhaseData] = useState<any>(null);

  // Form states
  const [title, setTitle] = useState("Student Council Election 2026");
  const [registrationStart, setRegistrationStart] = useState("");
  const [registrationEnd, setRegistrationEnd] = useState("");
  const [documentDeadline, setDocumentDeadline] = useState("");
  const [votingStart, setVotingStart] = useState("");
  const [votingEnd, setVotingEnd] = useState("");
  const [eligibleDepartment, setEligibleDepartment] = useState("");
  const [savingElection, setSavingElection] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [reconfirmOpen, setReconfirmOpen] = useState(false);
  const [reconfirmAction, setReconfirmAction] = useState<string | null>(null);
  const [reconfirmDescription, setReconfirmDescription] = useState("");

  function formatDateTimeForInput(dateStr?: string) {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      const pad = (n: number) => n.toString().padStart(2, "0");
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const min = pad(d.getMinutes());
      return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    } catch {
      return "";
    }
  }

  const runValidation = (regStart: string, regEnd: string, votStart: string, votEnd: string) => {
    const errs: Record<string, string> = {};
    const dRegStart = regStart ? new Date(regStart) : null;
    const dRegEnd = regEnd ? new Date(regEnd) : null;
    const dVotStart = votStart ? new Date(votStart) : null;
    const dVotEnd = votEnd ? new Date(votEnd) : null;

    if (dRegStart && dRegEnd && dRegEnd <= dRegStart) {
      errs.registrationEnd = "Registration closes must be after registration opens.";
    }
    if (dRegEnd && dVotStart && dVotStart <= dRegEnd) {
      errs.votingStart = "Voting opens must be after registration closes.";
    } else if (dRegStart && dVotStart && dVotStart <= dRegStart) {
      errs.votingStart = "Voting opens must be after registration opens.";
    }
    if (dVotStart && dVotEnd && dVotEnd <= dVotStart) {
      errs.votingEnd = "Voting closes must be after voting opens.";
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegStartChange = (val: string) => {
    setRegistrationStart(val);
    runValidation(val, registrationEnd, votingStart, votingEnd);
  };
  const handleRegEndChange = (val: string) => {
    setRegistrationEnd(val);
    runValidation(registrationStart, val, votingStart, votingEnd);
  };
  const handleVotStartChange = (val: string) => {
    setVotingStart(val);
    runValidation(registrationStart, registrationEnd, val, votingEnd);
  };
  const handleVotEndChange = (val: string) => {
    setVotingEnd(val);
    runValidation(registrationStart, registrationEnd, votingStart, val);
  };

  async function loadElection() {
    setLoadingElection(true);
    try {
      const data = await fetchCurrentElection();
      setElection(data);
      if (data) {
        setTitle(data.title || "Student Council Election 2026");
        setRegistrationStart(formatDateTimeForInput(data.registration_start));
        setRegistrationEnd(formatDateTimeForInput(data.registration_end));
        setDocumentDeadline(formatDateTimeForInput(data.document_deadline));
        setVotingStart(formatDateTimeForInput(data.voting_start));
        setVotingEnd(formatDateTimeForInput(data.voting_end));
        setEligibleDepartment(data.eligible_department || "");
        // clear errors on fresh load
        setValidationErrors({});
      }

      const phaseRes = await getCurrentPhase();
      setPhaseData(phaseRes);
    } catch (e) {
      console.warn("Failed to fetch current election status from backend:", e);
    } finally {
      setLoadingElection(false);
    }
  }

  async function handleSaveElection() {
    if (!title.trim()) {
      toast.error("Election title cannot be empty.");
      return;
    }

    const isValid = runValidation(registrationStart, registrationEnd, votingStart, votingEnd);
    if (!isValid) {
      toast.error("Please resolve the validation errors before saving.");
      return;
    }

    setSavingElection(true);
    try {
      const payload = {
        title,
        registration_start: registrationStart ? new Date(registrationStart).toISOString() : null,
        registration_end: registrationEnd ? new Date(registrationEnd).toISOString() : null,
        document_deadline: documentDeadline ? new Date(documentDeadline).toISOString() : null,
        voting_start: votingStart ? new Date(votingStart).toISOString() : null,
        voting_end: votingEnd ? new Date(votingEnd).toISOString() : null,
        eligible_department: eligibleDepartment || null,
      };

      if (election?.election_id) {
        await updateElectionDates(election.election_id, payload);
        toast.success("Election details saved successfully!");
      } else {
        await createElection(payload);
        toast.success("Election created successfully!");
      }

      await loadElection();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to save election details.");
    } finally {
      setSavingElection(false);
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
  async function handleAnnounce() {
    if (!election) return;
    setUpdatingStatus(true);
    try {
      const res = await announceElectionSchedule(election.election_id);
      toast.success(res.message);
      await loadElection();
    } catch (e: any) {
      toast.error(e.message || "Failed to announce");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handlePause() {
    if (!election) return;
    setUpdatingStatus(true);
    try {
      const res = await pauseElection(election.election_id);
      toast.success(res.message);
      await loadElection();
    } catch (e: any) {
      toast.error(e.message || "Failed to pause");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleResume() {
    if (!election) return;
    setUpdatingStatus(true);
    try {
      const res = await resumeElection(election.election_id);
      toast.success(res.message);
      await loadElection();
    } catch (e: any) {
      toast.error(e.message || "Failed to resume");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleEmergencyStop() {
    if (!election) return;
    if (!confirm("EMERGENCY STOP will immediately close voting. This cannot be undone. Proceed?"))
      return;
    setUpdatingStatus(true);
    try {
      const res = await emergencyStopElection(election.election_id);
      toast.success(res.message);
      await loadElection();
    } catch (e: any) {
      toast.error(e.message || "Failed to stop election");
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

  async function loadCandidates() {
    setLoadingCandidates(true);
    try {
      const data = await fetchCandidates();
      setCandidates(data);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to load candidates list");
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function handleRejectCandidateConfirm() {
    if (!rejectCandidateId) return;
    setActionLoadingCandidateId(rejectCandidateId);
    try {
      await updateCandidateStatus(rejectCandidateId, "REJECTED", rejectReason);
      toast.success("Application rejected successfully");
      await loadCandidates();
      setRejectCandidateId(null);
      setRejectReason("");
    } catch (err: any) {
      toast.error(err.message || "Failed to reject candidate");
    } finally {
      setActionLoadingCandidateId(null);
    }
  }

  useEffect(() => {
    loadVoters();
    loadElection();
    loadCandidates();
  }, []);

  async function handleSaveVerificationId(voterId: string) {
    const code = editingIdVal.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      toast.error("Verification ID must be exactly 8 uppercase alphanumeric characters.");
      return;
    }

    setSavingVoterId(voterId);
    try {
      await setVoterVerificationCode(voterId, code);
      toast.success("Verification ID successfully set!");
      // Update local state
      setVoters(
        voters.map((v) => (v.voter_id === voterId ? { ...v, verification_id_set: true } : v)),
      );
      setEditingVoterId(null);
      setEditingIdVal("");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to set verification ID");
    } finally {
      setSavingVoterId(null);
    }
  }

  const handleFaceUpload = async (voterId: string, file: File) => {
    setUploadingFaceId(voterId);
    try {
      const token = getAuthToken();
      const csrfToken = getCsrfToken();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE_URL}/admin/voters/${voterId}/upload-face`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      toast.success(data.message || "Face uploaded successfully!");
      setVoters(
        voters.map((v) =>
          v.voter_id === voterId
            ? {
                ...v,
                face_enrolled: true,
                reference_image_url: data.reference_image_url ?? v.reference_image_url,
              }
            : v,
        ),
      );
      await loadVoters(); // Refresh the list to keep backend state in sync
    } catch (err: any) {
      toast.error(
        err.message === "CSRF token validation failed"
          ? "Session expired or CSRF token mismatch. Please log in again and retry."
          : err.message || "Failed to enroll face",
      );
    } finally {
      setUploadingFaceId(null);
    }
  };

  async function handleTogglePermission(voterId: string, currentPermission: boolean) {
    setUpdatingVoterId(voterId);
    try {
      const nextPermission = !currentPermission;
      const res = await updateVoterPermission(voterId, nextPermission);
      toast.success(res.message);

      // Update local state
      setVoters(
        voters.map((v) => (v.voter_id === voterId ? { ...v, vote_permission: nextPermission } : v)),
      );
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to update voter permission");
    } finally {
      setUpdatingVoterId(null);
    }
  }

  // ── Derived department list & filtered voters ──────────────
  const departments = useMemo(() => {
    const depts = new Set<string>();
    voters.forEach((v) => {
      if (v.department) depts.add(v.department.trim());
    });
    return ["All", ...Array.from(depts).sort()];
  }, [voters]);

  const filteredVoters = useMemo(() => {
    return voters.filter((v) => {
      const matchesSearch =
        (v.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.student_id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.college_email || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = selectedDept === "All" || (v.department || "").trim() === selectedDept;
      return matchesSearch && matchesDept;
    });
  }, [voters, searchQuery, selectedDept]);

  const deptStats = useMemo(() => {
    const map: Record<string, { total: number; allowed: number; voted: number }> = {};
    voters.forEach((v) => {
      const d = (v.department || "Unknown").trim();
      if (!map[d]) map[d] = { total: 0, allowed: 0, voted: 0 };
      map[d].total++;
      if (v.vote_permission) map[d].allowed++;
      if (v.has_voted) map[d].voted++;
    });
    return map;
  }, [voters]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      const matchesSearch =
        (c.full_name || "").toLowerCase().includes(candidateSearchQuery.toLowerCase()) ||
        (c.college_email || "").toLowerCase().includes(candidateSearchQuery.toLowerCase()) ||
        (c.position || "").toLowerCase().includes(candidateSearchQuery.toLowerCase()) ||
        (c.department || "").toLowerCase().includes(candidateSearchQuery.toLowerCase());
      const matchesStatus =
        selectedCandidateStatus === "All" || c.status === selectedCandidateStatus;
      return matchesSearch && matchesStatus;
    });
  }, [candidates, candidateSearchQuery, selectedCandidateStatus]);

  async function handleBulkPermission(dept: string, grant: boolean) {
    const targets = (
      dept === "All" ? voters : voters.filter((v) => (v.department || "").trim() === dept)
    ).filter((v) => v.vote_permission !== grant);
    if (targets.length === 0) {
      toast.info(`All voters in ${dept} are already ${grant ? "allowed" : "blocked"}.`);
      return;
    }
    setBulkUpdating(true);
    try {
      // Use the efficient bulk endpoint instead of looping one-by-one
      const deptParam = dept === "All" ? "All" : dept;
      const res = await bulkUpdateVoterPermission(deptParam, grant);
      // Update local state
      setVoters((prev) =>
        prev.map((v) => {
          const matchesDept = dept === "All" || (v.department || "").trim() === dept;
          return matchesDept ? { ...v, vote_permission: grant } : v;
        }),
      );
      toast.success(res.message || `${res.affected_count} voter(s) updated.`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to bulk update permissions");
      // Fallback: try individual updates
      let success = 0;
      let fail = 0;
      for (const v of targets) {
        try {
          await updateVoterPermission(v.voter_id, grant);
          success++;
        } catch {
          fail++;
        }
      }
      setVoters((prev) =>
        prev.map((v) => {
          const inTarget = targets.some((t) => t.voter_id === v.voter_id);
          return inTarget ? { ...v, vote_permission: grant } : v;
        }),
      );
      if (fail === 0) {
        toast.success(`${success} voter${success !== 1 ? "s" : ""} ${grant ? "allowed" : "blocked"} (fallback).`);
      } else {
        toast.warning(`${success} updated, ${fail} failed (fallback).`);
      }
    } finally {
      setBulkUpdating(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Election Control</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure, operate, and manage voter permissions.
        </p>
      </div>

      {/* ── Sub Navigation Tabs ── */}
      <div className="flex border-b border-border/60 gap-4">
        <button
          onClick={() => setActiveTab("voters")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all -mb-px flex items-center gap-2 ${
            activeTab === "voters"
              ? "border-[#0F8A5F] text-[#0F8A5F]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          Voter Registry & Permissions
        </button>
        <button
          onClick={() => setActiveTab("candidates")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all -mb-px flex items-center gap-2 ${
            activeTab === "candidates"
              ? "border-[#0F8A5F] text-[#0F8A5F]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserCheck className="h-4 w-4" />
          Candidates Registry
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all -mb-px flex items-center gap-2 ${
            activeTab === "settings"
              ? "border-[#0F8A5F] text-[#0F8A5F]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Edit2 className="h-4 w-4" />
          Configure Schedule & Settings
        </button>
      </div>

      <div className={activeTab === "settings" ? "grid grid-cols-1 lg:grid-cols-3 gap-6" : "w-full"}>
        <div className={activeTab === "settings" ? "lg:col-span-2 space-y-6" : "w-full"}>
          {activeTab === "voters" ? (
            /* Voter Voting Permission Control Section */
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#0F8A5F]" />
                  Voter Voting Permissions
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Filter by department, then bulk-allow or revoke access for any group.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={loadVoters}
                disabled={loadingVoters}
                className="gap-2"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingVoters ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* ── Summary stats row ── */}
            {!loadingVoters && voters.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Voters", value: voters.length, color: "text-foreground" },
                  {
                    label: "Allowed to Vote",
                    value: voters.filter((v) => v.vote_permission).length,
                    color: "text-[#0F8A5F]",
                  },
                  {
                    label: "Already Voted",
                    value: voters.filter((v) => v.has_voted).length,
                    color: "text-emerald-500",
                  },
                  {
                    label: "✅ Ready to Vote",
                    value: voters.filter((v) => v.vote_permission && v.verification_id_set && v.face_enrolled && !v.has_voted).length,
                    color: "text-success",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-muted/40 rounded-xl p-3 border border-border/40 text-center"
                  >
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Search ── */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by USN, name, or email..."
                className="pl-9 h-10 rounded-xl"
              />
            </div>

            {/* ── Department filter pills ── */}
            {!loadingVoters && voters.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => {
                  const stats =
                    dept === "All"
                      ? {
                          total: voters.length,
                          allowed: voters.filter((v) => v.vote_permission).length,
                        }
                      : deptStats[dept] || { total: 0, allowed: 0 };
                  const isActive = selectedDept === dept;
                  return (
                    <button
                      key={dept}
                      onClick={() => setSelectedDept(dept)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        isActive
                          ? "bg-[#0F8A5F] text-white border-[#0F8A5F] shadow-sm"
                          : "bg-muted/50 text-muted-foreground border-border hover:border-[#0F8A5F]/40 hover:text-foreground"
                      }`}
                    >
                      {dept === "All" ? (
                        <Users className="h-3 w-3" />
                      ) : (
                        <Building2 className="h-3 w-3" />
                      )}
                      {dept}
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isActive ? "bg-white/20" : "bg-border/60"
                        }`}
                      >
                        {stats.total}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Bulk action bar for selected department ── */}
            {!loadingVoters && filteredVoters.length > 0 && (
              <div className="flex items-center justify-between bg-muted/30 border border-border/50 rounded-xl px-4 py-3 flex-wrap gap-3">
                <div className="text-xs">
                  <span className="font-semibold text-foreground">
                    {selectedDept === "All" ? "All Departments" : selectedDept}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    {filteredVoters.length} voter{filteredVoters.length !== 1 ? "s" : ""} ·{" "}
                    {filteredVoters.filter((v) => v.vote_permission).length} allowed ·{" "}
                    {filteredVoters.filter((v) => v.has_voted).length} voted
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-[#0F8A5F] hover:bg-[#0F8A5F]/95 text-white h-8 text-xs gap-1.5"
                    disabled={bulkUpdating || filteredVoters.every((v) => v.vote_permission)}
                    onClick={() => handleBulkPermission(selectedDept, true)}
                  >
                    {bulkUpdating ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Unlock className="h-3 w-3" />
                    )}
                    Allow All
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 text-xs gap-1.5"
                    disabled={bulkUpdating || filteredVoters.every((v) => !v.vote_permission)}
                    onClick={() => handleBulkPermission(selectedDept, false)}
                  >
                    {bulkUpdating ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    )}
                    Revoke All
                  </Button>
                </div>
              </div>
            )}

            {loadingVoters ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <RefreshCw className="h-8 w-8 animate-spin text-[#0F8A5F] mb-2" />
                <p className="text-sm">Fetching registered voters...</p>
              </div>
            ) : filteredVoters.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-xl">
                <Building2 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No voters found{selectedDept !== "All" ? ` in ${selectedDept}` : ""}.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[650px] border border-border/60 rounded-xl relative scrollbar-thin">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-background z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">
                    <tr className="bg-muted/90 backdrop-blur-sm text-xs font-semibold text-muted-foreground border-b border-border/60">
                      <th className="p-3">Student Details</th>
                      <th className="p-3">Dept / Year</th>
                      <th className="p-3 text-center">Verification ID</th>
                      <th className="p-3 text-center">Face ID (Dept / USN)</th>
                      <th className="p-3 text-center">Voted?</th>
                      <th className="p-3 text-center">Permission</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-sm bg-background">
                    {filteredVoters.slice((voterPage - 1) * itemsPerPage, voterPage * itemsPerPage).map((v) => (
                      <tr key={v.voter_id} className="hover:bg-muted/35 transition-colors">
                        <td className="p-3">
                          <p className="font-medium text-foreground">{v.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {v.student_id} · {v.college_email}
                          </p>
                        </td>
                        <td className="p-3">
                          <p className="text-sm font-medium text-foreground">
                            {v.department || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Year {v.year_of_study || "—"}
                          </p>
                        </td>
                        <td className="p-3 text-center">
                          {editingVoterId === v.voter_id ? (
                            <div className="flex items-center justify-center gap-1.5 max-w-[150px] mx-auto">
                              <Input
                                value={editingIdVal}
                                onChange={(e) => setEditingIdVal(e.target.value.toUpperCase())}
                                placeholder="8 chars"
                                maxLength={8}
                                className="h-8 text-xs font-mono text-center uppercase tracking-wider w-20"
                              />
                              <Button
                                size="icon"
                                className="h-8 w-8 bg-success hover:bg-success/90 text-white"
                                disabled={savingVoterId === v.voter_id || editingIdVal.length !== 8}
                                onClick={() => handleSaveVerificationId(v.voter_id)}
                              >
                                {savingVoterId === v.voter_id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 text-muted-foreground border-border hover:bg-muted"
                                disabled={savingVoterId === v.voter_id}
                                onClick={() => {
                                  setEditingVoterId(null);
                                  setEditingIdVal("");
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              {v.verification_id_set ? (
                                <Badge className="bg-success/15 text-success border-0 font-medium">
                                  Set ✓
                                </Badge>
                              ) : (
                                <Badge
                                  variant="destructive"
                                  className="bg-destructive/15 text-destructive border-0 font-medium"
                                >
                                  Not Set
                                </Badge>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setEditingVoterId(v.voter_id);
                                  setEditingIdVal("");
                                }}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center justify-center gap-2">
                            {v.face_enrolled ? (
                              <div className="flex flex-col items-center gap-1.5">
                                <Badge className="bg-[#0F8A5F]/15 text-[#0F8A5F] border-0 font-medium">
                                  Enrolled ✓
                                </Badge>
                                {v.reference_image_url && (
                                  <div
                                    className="relative group cursor-pointer h-10 w-10 rounded-full overflow-hidden border border-[#0F8A5F]/30 hover:border-[#0F8A5F] transition-all"
                                    onClick={() => setSelectedPreviewImage(resolveVoterPhotoUrl(v.voter_id))}
                                    title="Click to zoom reference photo"
                                  >
                                    <img
                                      src={resolveVoterPhotoUrl(v.voter_id)}
                                      alt="Face preview"
                                      className="h-full w-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = "https://api.dicebear.com/7.x/avataaars/svg?seed=" + v.full_name;
                                      }}
                                    />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Eye className="h-3.5 w-3.5 text-white" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Badge
                                variant="destructive"
                                className="bg-destructive/15 text-destructive border-0 font-medium"
                              >
                                Not Enrolled
                              </Badge>
                            )}
                            <span className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                              {v.department !== "—" ? v.department : "—"} · {v.student_id !== "—" ? v.student_id : "No USN"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {v.face_enrolled ? "Photo on file" : "No face uploaded"}
                            </span>
                            <div>
                              <input
                                type="file"
                                id={`face-upload-${v.voter_id}`}
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleFaceUpload(v.voter_id, e.target.files[0]);
                                  }
                                }}
                              />
                              <label htmlFor={`face-upload-${v.voter_id}`}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs cursor-pointer"
                                  disabled={uploadingFaceId === v.voter_id}
                                  asChild
                                >
                                  <span>
                                    {uploadingFaceId === v.voter_id ? (
                                      <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                                    ) : (
                                      <Plus className="h-3 w-3 mr-1" />
                                    )}
                                    {v.face_enrolled ? "Replace" : "Upload Face"}
                                  </span>
                                </Button>
                              </label>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {v.has_voted ? (
                            <Badge className="bg-success/15 text-success border-0 font-medium">
                              Voted ✓
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground border-border font-medium"
                            >
                              Not Yet
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {v.vote_permission ? (
                            <Badge className="bg-[#0F8A5F]/15 text-[#0F8A5F] border-0 font-medium gap-1">
                              <Unlock className="h-3 w-3" />
                              Allowed
                            </Badge>
                          ) : (
                            <Badge
                              variant="destructive"
                              className="bg-destructive/15 text-destructive border-0 font-medium gap-1"
                            >
                              <Lock className="h-3 w-3" />
                              Blocked
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant={v.vote_permission ? "destructive" : "default"}
                            className={
                              v.vote_permission
                                ? ""
                                : "bg-[#0F8A5F] hover:bg-[#0F8A5F]/90 text-white"
                            }
                            disabled={updatingVoterId === v.voter_id}
                            onClick={() => handleTogglePermission(v.voter_id, v.vote_permission)}
                          >
                            {updatingVoterId === v.voter_id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : v.vote_permission ? (
                              "Revoke"
                            ) : (
                              "Allow"
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Pagination Controls */}
                {Math.ceil(filteredVoters.length / itemsPerPage) > 1 && (
                  <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 bg-muted/10 text-xs sticky bottom-0 bg-background z-20 shadow-[inset_0_1px_0_rgba(0,0,0,0.1)]">
                    <span className="text-muted-foreground">
                      Showing {(voterPage - 1) * itemsPerPage + 1} to {Math.min(voterPage * itemsPerPage, filteredVoters.length)} of {filteredVoters.length} voters
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={voterPage === 1}
                        onClick={() => setVoterPage(prev => Math.max(prev - 1, 1))}
                        className="h-8 px-2.5"
                      >
                        Previous
                      </Button>
                      <span className="px-2 text-muted-foreground font-semibold">
                        Page {voterPage} of {Math.ceil(filteredVoters.length / itemsPerPage)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={voterPage === Math.ceil(filteredVoters.length / itemsPerPage)}
                        onClick={() => setVoterPage(prev => Math.min(prev + 1, Math.ceil(filteredVoters.length / itemsPerPage)))}
                        className="h-8 px-2.5"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          ) : activeTab === "candidates" ? (
            /* Candidates Registry Section */
            <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4 animate-in fade-in duration-200">
              {/* ── Header ── */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-[#0F8A5F]" />
                    Candidates Registry
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Approve, reject, or preview candidate applications.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadCandidates}
                  disabled={loadingCandidates}
                  className="gap-2"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingCandidates ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {/* ── Summary stats row ── */}
              {!loadingCandidates && candidates.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Candidates", value: candidates.length, color: "text-foreground" },
                    {
                      label: "Approved",
                      value: candidates.filter((c) => c.status === "Approved").length,
                      color: "text-emerald-500",
                    },
                    {
                      label: "Pending Review",
                      value: candidates.filter((c) => c.status === "Pending" || c.status === "Under Review").length,
                      color: "text-[#0F8A5F]",
                    },
                    {
                      label: "Rejected",
                      value: candidates.filter((c) => c.status === "Rejected").length,
                      color: "text-destructive",
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="bg-muted/40 rounded-xl p-3 border border-border/40 text-center"
                    >
                      <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Search & Filter pills ── */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={candidateSearchQuery}
                    onChange={(e) => setCandidateSearchQuery(e.target.value)}
                    placeholder="Search candidates by name, email, department, or position..."
                    className="pl-9 h-10 rounded-xl"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto select-none font-mono">
                  {["All", "Pending", "Under Review", "Approved", "Rejected"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedCandidateStatus(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        selectedCandidateStatus === s
                          ? "bg-[#0F8A5F] text-white border-[#0F8A5F] shadow-sm"
                          : "bg-muted/50 text-muted-foreground border-border hover:border-[#0F8A5F]/40 hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {loadingCandidates ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <RefreshCw className="h-8 w-8 animate-spin text-[#0F8A5F] mb-2" />
                  <p className="text-sm">Fetching candidates...</p>
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-border rounded-xl">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No candidates found{selectedCandidateStatus !== "All" ? ` with status ${selectedCandidateStatus}` : ""}.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[650px] border border-border/60 rounded-xl relative scrollbar-thin">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-background z-20 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">
                      <tr className="bg-muted/90 backdrop-blur-sm text-xs font-semibold text-muted-foreground border-b border-border/60">
                        <th className="p-3">Candidate Details</th>
                        <th className="p-3">Dept / Sem</th>
                        <th className="p-3">Applied For (Position)</th>
                        <th className="p-3">Contact</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-sm bg-background">
                      {filteredCandidates.slice((candidatePage - 1) * itemsPerPage, candidatePage * itemsPerPage).map((c) => (
                        <tr key={c.candidate_id} className="hover:bg-muted/35 transition-colors">
                          <td className="p-3">
                            <p className="font-medium text-foreground">{c.full_name}</p>
                            <p className="text-xs text-muted-foreground">{c.college_email}</p>
                          </td>
                          <td className="p-3">
                            <p className="text-sm font-medium text-foreground">{c.department}</p>
                            <p className="text-xs text-muted-foreground">Semester {c.semester}</p>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="bg-[#0F8A5F]/5 text-[#0F8A5F] border-[#0F8A5F]/20 px-2 py-0.5 font-medium">
                              {c.position}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs font-mono text-muted-foreground">
                            {c.mobile_number || "—"}
                          </td>
                          <td className="p-3 text-center">
                            <Badge
                              className={
                                c.status === "Approved"
                                  ? "bg-success/15 text-success border-0 font-medium"
                                  : c.status === "Rejected"
                                    ? "bg-destructive/15 text-destructive border-0 font-medium"
                                    : c.status === "Under Review"
                                      ? "bg-[#0F8A5F]/15 text-[#0F8A5F] border-0 font-medium"
                                      : "bg-warning/15 text-amber-600 border-0 font-medium"
                              }
                            >
                              {c.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => setPreviewCandidate(c)}
                              >
                                Preview
                              </Button>
                              <Button
                                size="sm"
                                className="bg-success hover:bg-success/90 text-white h-8 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => {
                                  setSelectedCandidateId(c.candidate_id);
                                  setReconfirmDescription(`Approving candidate ${c.full_name} is a sensitive action. Please confirm your password to proceed.`);
                                  setReconfirmAction("candidate_approve");
                                  setReconfirmOpen(true);
                                }}
                                disabled={actionLoadingCandidateId === c.candidate_id || c.status === "Approved"}
                              >
                                {actionLoadingCandidateId === c.candidate_id && selectedCandidateId === c.candidate_id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Approve"
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => {
                                  setSelectedCandidateId(c.candidate_id);
                                  setReconfirmDescription(`Rejecting candidate ${c.full_name} is a sensitive action. Please confirm your password to proceed.`);
                                  setReconfirmAction("candidate_reject");
                                  setReconfirmOpen(true);
                                }}
                                disabled={actionLoadingCandidateId === c.candidate_id || c.status === "Rejected"}
                              >
                                Reject
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Pagination Controls */}
                  {Math.ceil(filteredCandidates.length / itemsPerPage) > 1 && (
                    <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 bg-muted/10 text-xs sticky bottom-0 bg-background z-20 shadow-[inset_0_1px_0_rgba(0,0,0,0.1)]">
                      <span className="text-muted-foreground">
                        Showing {(candidatePage - 1) * itemsPerPage + 1} to {Math.min(candidatePage * itemsPerPage, filteredCandidates.length)} of {filteredCandidates.length} candidates
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={candidatePage === 1}
                          onClick={() => setCandidatePage(prev => Math.max(prev - 1, 1))}
                          className="h-8 px-2.5"
                        >
                          Previous
                        </Button>
                        <span className="px-2 text-muted-foreground font-semibold">
                          Page {candidatePage} of {Math.ceil(filteredCandidates.length / itemsPerPage)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={candidatePage === Math.ceil(filteredCandidates.length / itemsPerPage)}
                          onClick={() => setCandidatePage(prev => Math.min(prev + 1, Math.ceil(filteredCandidates.length / itemsPerPage)))}
                          className="h-8 px-2.5"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Create / Edit Election Section */
            <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
            <h2 className="text-base font-semibold">Create / Edit Election</h2>
            <Field label="Election Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter election title"
              />
            </Field>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Positions</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {positions.map((p) => (
                  <Badge key={p} variant="outline" className="gap-1 pr-1">
                    {p}
                    <button onClick={() => setPositions((arr) => arr.filter((x) => x !== p))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  value={newPos}
                  onChange={(e) => setNewPos(e.target.value)}
                  placeholder="Add position"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (newPos) {
                      setPositions((p) => [...p, newPos]);
                      setNewPos("");
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Registration Opens">
                <Input
                  type="datetime-local"
                  value={registrationStart}
                  onChange={(e) => handleRegStartChange(e.target.value)}
                  className={
                    validationErrors.registrationStart
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                />
                {validationErrors.registrationStart && (
                  <p className="text-xs text-destructive mt-1">
                    {validationErrors.registrationStart}
                  </p>
                )}
              </Field>
              <Field label="Registration Closes">
                <Input
                  type="datetime-local"
                  value={registrationEnd}
                  onChange={(e) => handleRegEndChange(e.target.value)}
                  className={
                    validationErrors.registrationEnd
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                />
                {validationErrors.registrationEnd && (
                  <p className="text-xs text-destructive mt-1">
                    {validationErrors.registrationEnd}
                  </p>
                )}
              </Field>
              <Field label="Document Deadline">
                <Input
                  type="datetime-local"
                  value={documentDeadline}
                  onChange={(e) => setDocumentDeadline(e.target.value)}
                  className={
                    validationErrors.documentDeadline
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                />
                {validationErrors.documentDeadline && (
                  <p className="text-xs text-destructive mt-1">
                    {validationErrors.documentDeadline}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Deadline for manifesto/document uploads after registration closes.
                </p>
              </Field>
              <Field label="Eligible Department (optional)">
                <Input
                  value={eligibleDepartment}
                  onChange={(e) => setEligibleDepartment(e.target.value)}
                  placeholder="e.g. Computer Science"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty for college-wide elections. Set to restrict candidacy to one department.
                </p>
              </Field>
              <Field label="Voting Opens">
                <Input
                  type="datetime-local"
                  value={votingStart}
                  onChange={(e) => handleVotStartChange(e.target.value)}
                  className={
                    validationErrors.votingStart
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                />
                {validationErrors.votingStart && (
                  <p className="text-xs text-destructive mt-1">{validationErrors.votingStart}</p>
                )}
              </Field>
              <Field label="Voting Closes">
                <Input
                  type="datetime-local"
                  value={votingEnd}
                  onChange={(e) => handleVotEndChange(e.target.value)}
                  className={
                    validationErrors.votingEnd
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                />
                {validationErrors.votingEnd && (
                  <p className="text-xs text-destructive mt-1">{validationErrors.votingEnd}</p>
                )}
              </Field>
            </div>
            <Button
              className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 gap-2"
              onClick={handleSaveElection}
              disabled={savingElection || Object.keys(validationErrors).length > 0}
            >
              {savingElection ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Election"
              )}
            </Button>
          </div>
          )}
        </div>

        {activeTab === "settings" && (
          <div className="space-y-6">
            <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <RefreshCw
                className={`h-4 w-4 ${loadingElection ? "animate-spin text-muted-foreground" : "text-[#0F8A5F]"}`}
              />
              Real-Time Phase Tracker
            </h2>

            {phaseData ? (
              <div className="space-y-4">
                {phaseData.phase === "results_announced" ? (
                  /* Election Concluded / Results Published State */
                  <div className="space-y-4">
                    <div className="p-5 bg-success/5 rounded-2xl border border-success/20 text-center space-y-3">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                        <CheckCircle2 className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-bold text-success text-base">Election Concluded</h3>
                        <p className="text-xs text-muted-foreground">
                          Results have been officially tallied and published.
                        </p>
                      </div>
                      {election?.results_published_at && (
                        <p className="text-[11px] text-muted-foreground bg-muted/50 py-1.5 px-3 rounded-lg inline-block">
                          Published: {new Date(election.results_published_at).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {election?.result_integrity_hash && (
                      <div className="p-4 bg-muted/40 rounded-xl border border-border/60 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-success" />
                            Security Integrity Hash
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(election.result_integrity_hash);
                              toast.success("Integrity hash copied to clipboard!");
                            }}
                            className="text-[#0F8A5F] hover:underline"
                          >
                            Copy
                          </button>
                        </div>
                        <p className="font-mono text-[10px] break-all text-foreground bg-background p-2 rounded border border-border/40 select-all">
                          {election.result_integrity_hash}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Standard Phase Tracker States */
                  <div className="space-y-4">
                    <div className="p-4 bg-[#D9A441]/5 rounded-xl border border-[#D9A441]/10 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-muted-foreground">
                          Current Phase:
                        </span>
                        <Badge
                          className={
                            phaseData.is_paused
                              ? "bg-amber-500/15 text-amber-600 border-0"
                              : phaseData.phase === "voting_open"
                                ? "bg-emerald-500/15 text-emerald-600 border-0"
                                : "bg-[#0F8A5F]/15 text-[#0F8A5F] border-0"
                          }
                        >
                          {phaseData.is_paused
                            ? "PAUSED"
                            : (phaseData.phase || "Unknown").toUpperCase().replace(/_/g, " ")}
                        </Badge>
                      </div>

                      {!phaseData.is_paused && phaseData.remaining_time && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-muted-foreground">
                            Time Remaining:
                          </span>
                          <span className="text-sm font-mono font-bold text-[#0F8A5F]">
                            {phaseData.remaining_time}
                          </span>
                        </div>
                      )}

                      {!phaseData.is_paused && phaseData.next_phase && (
                        <div className="flex justify-between items-center pt-2 border-t border-[#D9A441]/10">
                          <span className="text-xs font-medium text-muted-foreground">Next Phase:</span>
                          <span className="text-xs font-medium text-muted-foreground">
                            {phaseData.next_phase.replace(/_/g, " ")}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                      <Button
                        className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 w-full"
                        onClick={() => {
                          setReconfirmDescription("Announcing the election schedule will send emails to all users.");
                          setReconfirmAction("announce");
                          setReconfirmOpen(true);
                        }}
                        disabled={updatingStatus}
                      >
                        Announce Schedule
                      </Button>

                      <div className="grid grid-cols-2 gap-2">
                        {phaseData.is_paused ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setReconfirmDescription("Resume the election from its current phase.");
                              setReconfirmAction("resume");
                              setReconfirmOpen(true);
                            }}
                            disabled={updatingStatus}
                            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          >
                            Resume
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setReconfirmDescription("Pause the election to temporarily halt all voting activity.");
                              setReconfirmAction("pause");
                              setReconfirmOpen(true);
                            }}
                            disabled={updatingStatus}
                            className="border-amber-200 text-amber-700 hover:bg-amber-50"
                          >
                            Pause
                          </Button>
                        )}

                        <Button
                          variant="destructive"
                          onClick={() => {
                            setReconfirmDescription("Emergency Stop will immediately close voting. This cannot be undone.");
                            setReconfirmAction("emergency_stop");
                            setReconfirmOpen(true);
                          }}
                          disabled={
                            updatingStatus ||
                            phaseData.phase === "voting_closed" ||
                            phaseData.phase === "results_announced"
                          }
                        >
                          Emergency Stop
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center flex flex-col items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-[#0F8A5F] mb-1" />
                Loading tracker details...
              </div>
            )}

            {phaseData && phaseData.phase !== "results_announced" && (
              <div className="pt-4 border-t border-border mt-2">
                <p className="text-xs text-muted-foreground font-medium mb-2">
                  Manual Fallback Overrides
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setReconfirmDescription("Force open voting to allow all eligible voters to cast their ballots.");
                      setReconfirmAction("open_voting");
                      setReconfirmOpen(true);
                    }}
                    disabled={
                      updatingStatus ||
                      !election ||
                      phaseData?.phase === "voting_open" ||
                      phaseData?.phase === "voting_closed"
                    }
                    className="disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Force Open Voting
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setReconfirmDescription("Force close voting to end the election voting phase immediately.");
                      setReconfirmAction("close_voting");
                      setReconfirmOpen(true);
                    }}
                    disabled={updatingStatus || !election || phaseData?.phase !== "voting_open"}
                    className="disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Force Close Voting
                  </Button>
                  <Button
                    className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => {
                      setReconfirmDescription("Publishing results will make them visible to all voters and candidates.");
                      setReconfirmAction("publish_results");
                      setReconfirmOpen(true);
                    }}
                    disabled={updatingStatus || !election || phaseData?.phase !== "voting_closed"}
                  >
                    Publish Results & Notify
                  </Button>
                </div>
              </div>
            )}
            </div>
          </div>
        )}
      {/* Password Reconfirmation Modal */}
      <ReconfirmPasswordModal
        open={reconfirmOpen}
        onOpenChange={(o) => { setReconfirmOpen(o); if (!o) { setReconfirmAction(null); setSelectedCandidateId(null); } }}
        title={{
          announce: "Announce Schedule",
          pause: "Pause Election",
          resume: "Resume Election",
          emergency_stop: "Emergency Stop",
          open_voting: "Force Open Voting",
          close_voting: "Force Close Voting",
          publish_results: "Publish Results",
          candidate_approve: "Approve Candidate",
          candidate_reject: "Reject Candidate",
        }[reconfirmAction ?? ""] || "Confirm Action"}
        description={reconfirmDescription}
        actionLabel={{
          announce: "Confirm & Announce",
          pause: "Confirm & Pause",
          resume: "Confirm & Resume",
          emergency_stop: "Confirm Emergency Stop",
          open_voting: "Confirm & Open",
          close_voting: "Confirm & Close",
          publish_results: "Confirm & Publish",
          candidate_approve: "Confirm Approve",
          candidate_reject: "Confirm Reject",
        }[reconfirmAction ?? ""] || "Confirm & Continue"}
        onVerified={async () => {
          if (!reconfirmAction) return;
          if (reconfirmAction !== "candidate_approve" && reconfirmAction !== "candidate_reject" && !election) return;
          setUpdatingStatus(true);
          try {
            let res;
            switch (reconfirmAction) {
              case "announce":
                res = await announceElectionSchedule(election.election_id);
                toast.success(res.message);
                break;
              case "pause":
                res = await pauseElection(election.election_id);
                toast.success(res.message);
                break;
              case "resume":
                res = await resumeElection(election.election_id);
                toast.success(res.message);
                break;
              case "emergency_stop":
                if (!confirm("EMERGENCY STOP will immediately close voting. This cannot be undone. Proceed?"))
                  return;
                res = await emergencyStopElection(election.election_id);
                toast.success(res.message);
                break;
              case "open_voting":
                res = await openVoting(election.election_id);
                toast.success(res.message || "Voting successfully opened!");
                break;
              case "close_voting":
                res = await closeVoting(election.election_id);
                toast.success(res.message || "Voting successfully closed!");
                break;
              case "publish_results":
                res = await publishResults(election.election_id);
                toast.success(res.message || "Results successfully published!");
                break;
              case "candidate_approve":
                if (selectedCandidateId) {
                  setActionLoadingCandidateId(selectedCandidateId);
                  try {
                    const name = candidates.find((c) => c.candidate_id === selectedCandidateId)?.full_name || "";
                    await updateCandidateStatus(selectedCandidateId, "APPROVED");
                    toast.success(`${name} approved successfully`);
                    await loadCandidates();
                  } catch (err: any) {
                    toast.error(err.message || "Failed to approve candidate");
                  } finally {
                    setActionLoadingCandidateId(null);
                    setSelectedCandidateId(null);
                  }
                }
                break;
              case "candidate_reject":
                if (selectedCandidateId) {
                  setRejectCandidateId(selectedCandidateId);
                  setSelectedCandidateId(null);
                }
                break;
            }
            if (reconfirmAction !== "candidate_approve" && reconfirmAction !== "candidate_reject") {
              await loadElection();
            }
          } catch (e: any) {
            toast.error(e.message || "Action failed");
          } finally {
            setUpdatingStatus(false);
            setReconfirmAction(null);
          }
        }}
      />
      </div>
      
      {/* ── Candidate Preview Modal ── */}
      <Dialog open={!!previewCandidate} onOpenChange={(b) => !b && setPreviewCandidate(null)}>
        <DialogContent className="max-w-md p-6 rounded-2xl border border-border/80 bg-card">
          {previewCandidate && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 border-b border-border/40 pb-3">
                <img
                  src={
                    previewCandidate.party_symbol_url ||
                    "https://api.dicebear.com/7.x/identicon/svg?seed=symbol"
                  }
                  alt="Party Symbol"
                  className="h-12 w-12 rounded-xl bg-muted p-1 border border-border"
                />
                <div>
                  <DialogTitle className="text-lg font-bold">
                    {previewCandidate.full_name}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">{previewCandidate.college_email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40 font-mono">
                  <span className="text-muted-foreground block font-medium font-sans">Position</span>
                  <span className="font-bold text-foreground mt-0.5 block">
                    {previewCandidate.position}
                  </span>
                </div>
                <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40 font-mono">
                  <span className="text-muted-foreground block font-medium font-sans">Department</span>
                  <span className="font-bold text-foreground mt-0.5 block">
                    {previewCandidate.department} (Sem {previewCandidate.semester})
                  </span>
                </div>
                <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40 font-mono">
                  <span className="text-muted-foreground block font-medium font-sans">Mobile Contact</span>
                  <span className="font-bold text-foreground mt-0.5 block">
                    {previewCandidate.mobile_number}
                  </span>
                </div>
                <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40 font-mono">
                  <span className="text-muted-foreground block font-medium font-sans">Applied On</span>
                  <span className="font-bold text-foreground mt-0.5 block">
                    {previewCandidate.applied_at
                      ? new Date(previewCandidate.applied_at).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
              </div>

              <div className="space-y-1 bg-muted/20 border border-border/40 p-4 rounded-xl">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">Candidate Manifesto</span>
                  {previewCandidate.manifesto_status && (
                    <Badge variant="outline" className="text-[10px]">
                      {previewCandidate.manifesto_status}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground italic leading-relaxed mt-1 whitespace-pre-wrap">
                  "{previewCandidate.manifesto || "No manifesto submitted."}"
                </p>
                {previewCandidate.manifesto_status === "Pending Review" && (
                  <p className="text-[10px] text-amber-600 mt-2 font-sans">
                    Approve this manifesto under Admin → Manifesto Approval.
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 text-xs font-semibold px-4"
                  onClick={() => setPreviewCandidate(null)}
                >
                  Close Preview
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Candidate Rejection dialog ── */}
      <Dialog open={!!rejectCandidateId} onOpenChange={(b) => !b && setRejectCandidateId(null)}>
        <DialogContent className="max-w-md p-6 bg-card border border-border/80 rounded-2xl">
          <DialogTitle className="text-lg font-bold">Reject Candidate Application</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Provide a reason for rejection. This feedback will be sent directly to the candidate.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            className="w-full h-28 p-3 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0F8A5F]/50 bg-background mt-4 resize-none text-foreground"
          />
          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setRejectCandidateId(null);
                setRejectReason("");
              }}
              disabled={actionLoadingCandidateId === rejectCandidateId}
            >
              Cancel
            </Button>
            <Button
              disabled={!rejectReason.trim() || actionLoadingCandidateId === rejectCandidateId}
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={handleRejectCandidateConfirm}
            >
              {actionLoadingCandidateId === rejectCandidateId ? (
                <RefreshCw className="h-4 w-4 animate-spin text-white" />
              ) : (
                "Confirm Reject"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Voter reference photo zoom preview dialog ── */}
      <Dialog open={!!selectedPreviewImage} onOpenChange={(b) => !b && setSelectedPreviewImage(null)}>
        <DialogContent className="max-w-md p-6 flex flex-col items-center gap-4">
          <DialogTitle className="text-lg font-bold text-center w-full">Voter Reference Face Photo</DialogTitle>
          <div className="aspect-[3/4] w-full max-w-[280px] rounded-xl overflow-hidden border border-border shadow-md bg-muted flex items-center justify-center">
            {selectedPreviewImage ? (
              <img
                src={selectedPreviewImage}
                alt="Enrolled face zoom reference"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://api.dicebear.com/7.x/avataaars/svg?seed=preview";
                }}
              />
            ) : (
              <span className="text-xs text-muted-foreground">No image loaded</span>
            )}
          </div>
          <div className="w-full flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setSelectedPreviewImage(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
