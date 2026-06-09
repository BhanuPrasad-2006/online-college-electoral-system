import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Users,
  User,
  Building2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/context/AuthContext";
import {
  fetchPositions,
  registerCandidate,
  createParty,
  getOtpSession,
} from "@/lib/api";
import { fetchVoterProfile } from "@/lib/demo-api";

export const Route = createFileRoute("/candidate/register")({ component: Register });

function getSemesterFromYear(yearStr: string): string {
  if (!yearStr) return "";
  const match = yearStr.match(/\d+/);
  if (!match) return "";
  const year = parseInt(match[0], 10);
  if (isNaN(year)) return "";
  const sem = year * 2 - 1;
  const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  const suffix = suffixes[sem] || "th";
  return `${sem}${suffix} Sem`;
}

function savePrefillToSession(name: string, dept: string, sem: string, usn: string) {
  try {
    sessionStorage.setItem("candidate-prefill-name", name);
    sessionStorage.setItem("candidate-prefill-department", dept);
    sessionStorage.setItem("candidate-prefill-semester", sem);
    sessionStorage.setItem("candidate-prefill-usn", usn);
  } catch { /* ignore */ }
}

// Steps differ by candidate type
const STEPS_INDEPENDENT = ["Set Password", "Choose Type", "Candidate Details", "Terms", "Review"];
const STEPS_PARTY = ["Set Password", "Choose Type", "Party Details", "Terms", "Review"];

const TERMS = [
  "You must be a currently enrolled student and eligible under college election rules.",
  "All information provided during registration must be accurate and truthful.",
  "Candidates must use their official college email ID and keep account credentials secure.",
  "Candidates must maintain respectful behavior and avoid harassment, hate speech, false accusations, or unfair campaigning.",
  "Campaign content uploaded to the platform must not contain offensive, misleading, or illegal material.",
  "Candidates may use AI-generated manifesto suggestions provided by the platform responsibly and must verify all published content.",
  "Attempting to manipulate votes, create fake accounts, hack the platform, or misuse voter data is strictly prohibited.",
  "The election committee reserves the right to verify, approve, reject, suspend, or disqualify any candidate for rule violations.",
  "Candidate data will be used only for election-related purposes in accordance with the platform's privacy policy.",
  "By registering, the candidate agrees to follow all election rules and accepts the decisions of the election committee.",
  "Party candidates are subject to additional party conduct rules enforced by the election committee.",
];

function Register() {
  const nav = useNavigate();
  const { setCandidateRegistered, login } = useAuth();
  const [step, setStep] = useState(0);
  const [candidateType, setCandidateType] = useState<"INDEPENDENT" | "PARTY" | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [positionsError, setPositionsError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const STEPS = candidateType === "PARTY" ? STEPS_PARTY : STEPS_INDEPENDENT;

  const prefillName =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("candidate-prefill-name") || ""
      : "";
  const prefillDept =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("candidate-prefill-department") || ""
      : "";
  const prefillSem =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("candidate-prefill-semester") || ""
      : "";
  const prefillUsn =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("candidate-prefill-usn") || ""
      : "";
  const { mobile: sessionMobile, sessionToken } = getOtpSession();

  useEffect(() => {
    if (!sessionToken) {
      toast.error("Please complete eligibility check first.");
      nav({ to: "/candidate/apply" });
    }
  }, [sessionToken, nav]);

  // Independent candidate data
  const [data, setData] = useState({
    name: prefillName,
    department: prefillDept,
    semester: prefillSem,
    usn: prefillUsn,
    positionId: "",
    manifesto: "",
    newPassword: "",
    confirmPassword: "",
    photo: "",
    confirm: false,
    terms: false,
  });
  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));

  // Party candidate data
  const [partyData, setPartyData] = useState({
    partyName: "",
    partySymbol: "",
    partySlogan: "",
    partyManifesto: "",
    logoUrl: "",
    positionId: "",
    terms: false,
    confirm: false,
  });
  const setParty = (k: string, v: any) => setPartyData((d) => ({ ...d, [k]: v }));

  const selectedPosition = positions.find((p) => p.position_id === (candidateType === "PARTY" ? partyData.positionId : data.positionId));

  useEffect(() => {
    async function loadPositions() {
      setPositionsLoading(true);
      setPositionsError("");
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out. Backend may be unavailable.")), 15000)
        );
        const list = await Promise.race([fetchPositions(), timeoutPromise]);
        setPositions(list);
        if (list.length === 1) {
          setData((d) => ({ ...d, positionId: list[0].position_id }));
          setPartyData((d) => ({ ...d, positionId: list[0].position_id }));
        }
      } catch (err: any) {
        const msg = err.message || "Failed to load election positions.";
        setPositionsError(msg);
        toast.error(msg);
      } finally {
        setPositionsLoading(false);
      }
    }
    loadPositions();
  }, []);

  useEffect(() => {
    async function loadVoterDetails() {
      try {
        const savedName = sessionStorage.getItem("candidate-prefill-name");
        const savedDept = sessionStorage.getItem("candidate-prefill-department");
        const savedSem = sessionStorage.getItem("candidate-prefill-semester");
        const savedUsn = sessionStorage.getItem("candidate-prefill-usn");

        if (savedName || savedUsn) {
          setData((d) => ({
            ...d,
            name: d.name || savedName || "",
            department: d.department || savedDept || "",
            semester: d.semester || savedSem || "",
            usn: d.usn || savedUsn || "",
          }));
          return;
        }

        const voter = await fetchVoterProfile();
        if (voter) {
          setData((d) => {
            let semesterVal = d.semester;
            if (voter.year && voter.year !== "—") {
              semesterVal = getSemesterFromYear(voter.year);
            }
            const newName = d.name || voter.name;
            const newDept = d.department || (voter.department && voter.department !== "—" ? voter.department : "");
            const newSem = d.semester || semesterVal;
            const newUsn = d.usn || (voter.studentId && voter.studentId !== "—" ? voter.studentId : "");
            savePrefillToSession(newName, newDept, newSem, newUsn);
            return { ...d, name: newName, department: newDept, semester: newSem, usn: newUsn };
          });
        }
      } catch (err) {
        console.error("Failed to load voter profile:", err);
      }
    }
    loadVoterDetails();
  }, []);

  function handleNext() {
    if (step === 0) {
      // Password step
      if (!data.newPassword) {
        toast.error("Please enter a new password.");
        return;
      }
      const hasMinLength = data.newPassword.length >= 8;
      const hasUpper = /[A-Z]/.test(data.newPassword);
      const hasLower = /[a-z]/.test(data.newPassword);
      const hasNumber = /[0-9]/.test(data.newPassword);
      const hasSpecial = /[@$!%*?&#_]/.test(data.newPassword);
      if (!hasMinLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
        toast.error("Password does not meet all strength requirements.");
        return;
      }
      if (data.newPassword !== data.confirmPassword) {
        toast.error("Passwords do not match.");
        return;
      }
    }

    if (step === 1) {
      // Choose Type step
      if (!candidateType) {
        toast.error("Please choose a candidate type.");
        return;
      }
    }

    if (step === 2) {
      // Details step — independent OR party
      if (candidateType === "INDEPENDENT") {
        if (!data.name.trim()) { toast.error("Please enter your full name."); return; }
        if (!data.department.trim()) { toast.error("Please enter your department."); return; }
        if (!data.positionId) { toast.error("Please select a target position."); return; }
        if (!data.manifesto) { toast.error("Please write a campaign manifesto."); return; }
      } else {
        if (!partyData.partyName.trim()) { toast.error("Please enter a party name."); return; }
        if (!partyData.partyManifesto.trim() || partyData.partyManifesto.length < 50) {
          toast.error("Party manifesto must be at least 50 characters."); return;
        }
        if (!partyData.positionId) { toast.error("Please select a target position."); return; }
      }
    }

    setStep((s) => s + 1);
  }

  async function submit() {
    const termsAccepted = candidateType === "PARTY" ? partyData.terms : data.terms;
    const confirmAccepted = candidateType === "PARTY" ? partyData.confirm : data.confirm;
    if (!confirmAccepted || !termsAccepted) return;

    setLoading(true);
    setError("");

    try {
      const { sessionToken } = getOtpSession();
      const mobileNum = sessionMobile || "9999999999";

      if (candidateType === "INDEPENDENT") {
        if (!data.positionId) {
          toast.error("Please select a target position.");
          return;
        }
        await registerCandidate(sessionToken, {
          position_id: data.positionId,
          manifesto: data.manifesto,
          mobile_number: mobileNum,
          new_password: data.newPassword || undefined,
          full_name: data.name || undefined,
          department: data.department || undefined,
          student_id: data.usn || undefined,
        });
        setCandidateRegistered(true);
        login("candidate");
        toast.success("Independent candidate application submitted! Awaiting admin review.");
        nav({ to: "/candidate/dashboard" });
      } else {
        // Party creation
        await createParty(sessionToken, {
          party_name: partyData.partyName,
          party_symbol: partyData.partySymbol || undefined,
          party_slogan: partyData.partySlogan || undefined,
          party_manifesto: partyData.partyManifesto,
          logo_url: partyData.logoUrl || undefined,
          position_id: partyData.positionId,
          new_password: data.newPassword || undefined,
          full_name: data.name || undefined,
          department: data.department || undefined,
          student_id: data.usn || undefined,
        });
        setCandidateRegistered(true);
        login("candidate");
        toast.success("Party created! Awaiting admin approval before you can invite members.");
        nav({ to: "/candidate/dashboard" });
      }
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
      toast.error(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  const termsValue = candidateType === "PARTY" ? partyData.terms : data.terms;
  const confirmValue = candidateType === "PARTY" ? partyData.confirm : data.confirm;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-3xl bg-card rounded-2xl shadow-sm p-6 md:p-10">
        <h1 className="text-2xl font-bold">Candidate Registration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete all steps to submit your candidacy.
        </p>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center shrink-0">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                  i < step
                    ? "bg-success/15 text-success"
                    : i === step
                      ? "bg-[#0F8A5F] text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                  {i < step ? "✓" : i + 1}
                </span>
                {s}
              </div>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        <div className="mt-7">
          {/* ── Step 0: Password ── */}
          {step === 0 && (
            <div className="space-y-4 max-w-md mx-auto py-4">
              <h2 className="text-base font-semibold text-center">Set Secure Candidate Password</h2>
              <p className="text-xs text-muted-foreground text-center">
                Choose a secure password specifically for your candidate profile dashboard.
              </p>
              <div className="space-y-4 mt-6">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">New Password</label>
                  <div className="mt-1.5 relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="••••••••"
                      className="pr-10 h-11"
                      value={data.newPassword}
                      onChange={(e) => set("newPassword", e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Password strength */}
                <div className="mt-2 space-y-1.5 p-3.5 bg-muted/40 rounded-xl border border-border/60 text-xs">
                  <p className="font-semibold text-muted-foreground mb-1">Password Strength Checklist:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: "At least 8 characters", test: data.newPassword.length >= 8 },
                      { label: "At least 1 uppercase letter", test: /[A-Z]/.test(data.newPassword) },
                      { label: "At least 1 lowercase letter", test: /[a-z]/.test(data.newPassword) },
                      { label: "At least 1 number", test: /[0-9]/.test(data.newPassword) },
                      { label: "At least 1 special character", test: /[@$!%*?&#_]/.test(data.newPassword) },
                    ].map(({ label, test }) => (
                      <div key={label} className={cn("flex items-center gap-1.5", test ? "text-green-600 dark:text-green-400 font-medium" : "text-muted-foreground")}>
                        <span>{test ? "✓" : "○"}</span><span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Confirm New Password</label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className="mt-1.5 h-11"
                    value={data.confirmPassword}
                    onChange={(e) => set("confirmPassword", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Choose Type ── */}
          {step === 1 && (
            <div className="space-y-6 py-4 max-w-2xl mx-auto">
              <div className="text-center">
                <h2 className="text-lg font-bold">Choose Your Candidate Type</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Select how you want to run in this election. This cannot be changed after submission.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-4">
                {/* Independent */}
                <button
                  type="button"
                  onClick={() => setCandidateType("INDEPENDENT")}
                  className={cn(
                    "group flex flex-col items-center gap-4 p-7 rounded-2xl border-2 text-center transition-all duration-200 cursor-pointer",
                    candidateType === "INDEPENDENT"
                      ? "border-[#0F8A5F] bg-[#0F8A5F]/8 ring-2 ring-[#0F8A5F]/30 shadow-lg"
                      : "border-border bg-card hover:border-[#0F8A5F]/40 hover:bg-[#0F8A5F]/4 hover:shadow-md",
                  )}
                >
                  <div className={cn(
                    "h-16 w-16 rounded-2xl flex items-center justify-center transition-all",
                    candidateType === "INDEPENDENT"
                      ? "bg-[#0F8A5F] shadow-lg shadow-[#0F8A5F]/30"
                      : "bg-muted group-hover:bg-[#0F8A5F]/15",
                  )}>
                    <User className={cn("h-8 w-8", candidateType === "INDEPENDENT" ? "text-white" : "text-[#0F8A5F]")} />
                  </div>
                  <div>
                    <p className={cn("font-bold text-base", candidateType === "INDEPENDENT" ? "text-[#0F8A5F]" : "")}>
                      Independent Candidate
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      Run on your own platform. Submit a personal manifesto and campaign independently.
                    </p>
                  </div>
                  {candidateType === "INDEPENDENT" && (
                    <div className="flex items-center gap-1.5 text-[#0F8A5F] text-xs font-semibold">
                      <CheckCircle2 className="h-4 w-4" /> Selected
                    </div>
                  )}
                </button>

                {/* Party */}
                <button
                  type="button"
                  onClick={() => setCandidateType("PARTY")}
                  className={cn(
                    "group flex flex-col items-center gap-4 p-7 rounded-2xl border-2 text-center transition-all duration-200 cursor-pointer",
                    candidateType === "PARTY"
                      ? "border-[#0F8A5F] bg-[#0F8A5F]/8 ring-2 ring-[#0F8A5F]/30 shadow-lg"
                      : "border-border bg-card hover:border-[#0F8A5F]/40 hover:bg-[#0F8A5F]/4 hover:shadow-md",
                  )}
                >
                  <div className={cn(
                    "h-16 w-16 rounded-2xl flex items-center justify-center transition-all",
                    candidateType === "PARTY"
                      ? "bg-[#0F8A5F] shadow-lg shadow-[#0F8A5F]/30"
                      : "bg-muted group-hover:bg-[#0F8A5F]/15",
                  )}>
                    <Users className={cn("h-8 w-8", candidateType === "PARTY" ? "text-white" : "text-[#0F8A5F]")} />
                  </div>
                  <div>
                    <p className={cn("font-bold text-base", candidateType === "PARTY" ? "text-[#0F8A5F]" : "")}>
                      Party Candidate
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      Create a party and build a team. Invite members after admin approval.
                    </p>
                  </div>
                  {candidateType === "PARTY" && (
                    <div className="flex items-center gap-1.5 text-[#0F8A5F] text-xs font-semibold">
                      <CheckCircle2 className="h-4 w-4" /> Selected
                    </div>
                  )}
                </button>
              </div>

              {candidateType === "PARTY" && (
                <div className="mt-4 rounded-xl bg-[#0F8A5F]/8 border border-[#D9A441]/20 p-4">
                  <p className="text-xs text-[#0F8A5F] font-semibold flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Party Candidate Flow
                  </p>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                    <li>Create your party with name, symbol, slogan & manifesto</li>
                    <li>Submit for admin approval</li>
                    <li>Once approved, invite team members via Voter USN + Email</li>
                    <li>Members accept via their Voter Dashboard</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Details (Independent) ── */}
          {step === 2 && candidateType === "INDEPENDENT" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name">
                <Input value={data.name} onChange={(e) => set("name", e.target.value)} disabled className="bg-muted cursor-not-allowed opacity-70" placeholder="e.g. John Doe" />
              </Field>
              <Field label="Department">
                <Input value={data.department} onChange={(e) => set("department", e.target.value)} disabled className="bg-muted cursor-not-allowed opacity-70" placeholder="e.g. Computer Science" />
              </Field>
              <Field label="Current Semester">
                <Input value={data.semester} disabled className="bg-muted cursor-not-allowed opacity-70" placeholder="e.g. 6th" />
              </Field>
              <Field label="USN / Student ID">
                <Input value={data.usn} disabled className="bg-muted cursor-not-allowed opacity-70" placeholder="e.g. 1RV21CS001" />
              </Field>
              <Field label="Target Election Position *">
                {positionsLoading ? (
                  <div className="h-11 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">Loading positions...</div>
                ) : positionsError ? (
                  <div className="h-11 flex items-center px-3 rounded-md border border-destructive/50 bg-destructive/5 text-sm text-destructive">Unable to load positions.</div>
                ) : positions.length === 0 ? (
                  <div className="h-11 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">No active positions available.</div>
                ) : (
                  <Select value={data.positionId} onValueChange={(v) => set("positionId", v)}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select Position" /></SelectTrigger>
                    <SelectContent>
                      {positions.map((p) => (
                        <SelectItem key={p.position_id} value={p.position_id}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Personal Campaign Manifesto *">
                  <textarea
                    value={data.manifesto}
                    onChange={(e) => set("manifesto", e.target.value)}
                    placeholder="Describe your vision, goals, and campaign promises..."
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[120px]"
                  />
                </Field>
              </div>
              <UploadBox label="Candidate Photo" value={data.photo} onSet={(v) => set("photo", v)} />
            </div>
          )}

          {/* ── Step 2: Details (Party) ── */}
          {step === 2 && candidateType === "PARTY" && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-lg bg-[#0F8A5F]/15 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-[#0F8A5F]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Create Your Party</h2>
                  <p className="text-xs text-muted-foreground">This will be reviewed by admin before you can invite members.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Party Name *">
                  <Input
                    value={partyData.partyName}
                    onChange={(e) => setParty("partyName", e.target.value)}
                    placeholder="e.g. Vision Party"
                    className="h-11"
                    maxLength={150}
                  />
                </Field>
                <Field label="Party Symbol / Short Name">
                  <Input
                    value={partyData.partySymbol}
                    onChange={(e) => setParty("partySymbol", e.target.value)}
                    placeholder="e.g. VP or 🌟"
                    className="h-11"
                    maxLength={100}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Party Slogan">
                    <Input
                      value={partyData.partySlogan}
                      onChange={(e) => setParty("partySlogan", e.target.value)}
                      placeholder="e.g. Progress, Unity, Excellence"
                      className="h-11"
                      maxLength={300}
                    />
                  </Field>
                </div>
                <Field label="Target Election Position *">
                  {positionsLoading ? (
                    <div className="h-11 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">Loading positions...</div>
                  ) : positions.length === 0 ? (
                    <div className="h-11 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">No active positions available.</div>
                  ) : (
                    <Select value={partyData.positionId} onValueChange={(v) => setParty("positionId", v)}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Select Position" /></SelectTrigger>
                      <SelectContent>
                        {positions.map((p) => (
                          <SelectItem key={p.position_id} value={p.position_id}>{p.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
                <UploadBox label="Party Logo (Optional)" value={partyData.logoUrl} onSet={(v) => setParty("logoUrl", v)} />
                <div className="sm:col-span-2">
                  <Field label="Party Manifesto * (minimum 50 characters)">
                    <textarea
                      value={partyData.partyManifesto}
                      onChange={(e) => setParty("partyManifesto", e.target.value)}
                      placeholder="Describe your party's vision, agenda, goals, and campaign promises..."
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[150px]"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{partyData.partyManifesto.length} / min 50 chars</p>
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Terms ── */}
          {step === 3 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Terms & Conditions</h2>
              <p className="text-xs text-muted-foreground">Please read carefully — you must accept to continue.</p>
              <ol className="mt-3 space-y-2 max-h-[340px] overflow-y-auto pr-2 bg-muted/40 rounded-lg p-4 text-sm list-decimal list-inside">
                {TERMS.map((t, i) => (
                  <li key={i} className="leading-relaxed">{t}</li>
                ))}
              </ol>
              <label className="flex items-start gap-2 mt-4 cursor-pointer">
                <Checkbox
                  checked={termsValue}
                  onCheckedChange={(c) =>
                    candidateType === "PARTY" ? setParty("terms", !!c) : set("terms", !!c)
                  }
                  className="mt-0.5"
                />
                <span className="text-sm">I have read and agree to all the terms and conditions above.</span>
              </label>
            </div>
          )}

          {/* ── Step 4: Review ── */}
          {step === 4 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Review your information</h2>

              <div className="p-3 bg-[#0F8A5F]/8 border border-[#D9A441]/20 rounded-xl mb-3">
                <p className="text-xs font-semibold text-[#0F8A5F]">
                  Candidate Type: {candidateType === "PARTY" ? "🏛 Party Candidate (Leader)" : "👤 Independent Candidate"}
                </p>
              </div>

              {candidateType === "INDEPENDENT" && (
                <>
                  <Row k="Name" v={data.name || "—"} />
                  <Row k="Department" v={data.department || "—"} />
                  <Row k="Semester" v={data.semester || "—"} />
                  <Row k="Target Position" v={positions.find((p) => p.position_id === data.positionId)?.title || "—"} />
                  <Row k="Manifesto" v={data.manifesto ? `${data.manifesto.substring(0, 100)}...` : "—"} />
                  <Row k="Photo" v={data.photo || "Not uploaded"} />
                </>
              )}

              {candidateType === "PARTY" && (
                <>
                  <Row k="Party Name" v={partyData.partyName || "—"} />
                  <Row k="Party Symbol" v={partyData.partySymbol || "Not set"} />
                  <Row k="Party Slogan" v={partyData.partySlogan || "Not set"} />
                  <Row k="Target Position" v={positions.find((p) => p.position_id === partyData.positionId)?.title || "—"} />
                  <Row k="Manifesto" v={partyData.partyManifesto ? `${partyData.partyManifesto.substring(0, 100)}...` : "—"} />
                  <Row k="Logo" v={partyData.logoUrl || "Not uploaded"} />
                  <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      ⚠️ After submission your party will be reviewed by admin. Once approved, you can invite team members from the Party Dashboard.
                    </p>
                  </div>
                </>
              )}

              <Row k="Terms Accepted" v={termsValue ? "Yes" : "No"} />
              <label className="flex items-center gap-2 mt-5 cursor-pointer">
                <Checkbox
                  checked={confirmValue}
                  onCheckedChange={(c) =>
                    candidateType === "PARTY" ? setParty("confirm", !!c) : set("confirm", !!c)
                  }
                />
                <span className="text-sm">I confirm all the above information is accurate</span>
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 mt-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex justify-between gap-3 mt-8">
          <Button
            variant="outline"
            disabled={step === 0 || loading}
            onClick={() => setStep((s) => s - 1)}
          >
            ← Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90"
              disabled={step === 3 && !termsValue}
              onClick={handleNext}
            >
              Next →
            </Button>
          ) : (
            <Button
              className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90"
              disabled={!confirmValue || !termsValue || loading}
              onClick={submit}
            >
              {loading ? "Submitting..." : "Submit Application"}
            </Button>
          )}
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
    <div className="flex justify-between p-3 bg-muted/40 rounded-lg text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium max-w-[70%] text-right overflow-hidden text-ellipsis whitespace-nowrap">{v}</span>
    </div>
  );
}

function UploadBox({ label, value, onSet, simName }: { label: string; value: string; onSet: (v: string) => void; simName?: string }) {
  return (
    <div className="border-2 border-dashed border-border rounded-xl p-5 text-center">
      <p className="text-xs font-medium mb-2">{label}</p>
      {value ? (
        <div className="flex items-center justify-center gap-2 text-success text-sm">
          <CheckCircle2 className="h-4 w-4" /> {value}
        </div>
      ) : (
        <button
          onClick={() => onSet(simName || `${label.toLowerCase().replace(/\s+/g, "-")}.jpg`)}
          className="inline-flex items-center gap-2 text-xs text-[#0F8A5F] font-medium"
        >
          <Upload className="h-4 w-4" /> Drag & drop or click
        </button>
      )}
    </div>
  );
}
