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
import { Upload, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/context/AuthContext";
import { fetchPositions, registerCandidate, getOtpSession } from "@/lib/api";
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

// Save voter details to sessionStorage so register.tsx can read them
function savePrefillToSession(name: string, dept: string, sem: string, usn: string) {
  try {
    sessionStorage.setItem("candidate-prefill-name", name);
    sessionStorage.setItem("candidate-prefill-department", dept);
    sessionStorage.setItem("candidate-prefill-semester", sem);
    sessionStorage.setItem("candidate-prefill-usn", usn);
  } catch {
    /* ignore */
  }
}

const STEPS = ["Set Password", "Candidate Details", "Terms", "Review"];

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
];

function Register() {
  const nav = useNavigate();
  const { setCandidateRegistered, login } = useAuth();
  const [step, setStep] = useState(0);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [positionsError, setPositionsError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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

  // Redirect to eligibility check if no OTP session token
  useEffect(() => {
    if (!sessionToken) {
      toast.error("Please complete eligibility check first.");
      nav({ to: "/candidate/apply" });
    }
  }, [sessionToken, nav]);

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

  const selectedPosition = positions.find((p) => p.position_id === data.positionId);

  useEffect(() => {
    async function loadPositions() {
      setPositionsLoading(true);
      setPositionsError("");
      try {
        // Race the fetch against a 15-second timeout to prevent infinite loading
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out. Backend may be unavailable.")), 15000)
        );
        const list = await Promise.race([fetchPositions(), timeoutPromise]);
        setPositions(list);
        // Auto-select if only one position available
        if (list.length === 1) {
          setData((d) => ({ ...d, positionId: list[0].position_id }));
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

  // Load voter profile from demo-api (works with or without auth token)
  useEffect(() => {
    async function loadVoterDetails() {
      try {
        // Try fetching from sessionStorage first (saved by apply.tsx OTP flow)
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
          return; // Already have data from session storage
        }

        // Fallback: fetch from voter profile API (demo or live)
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

            // Save to sessionStorage for persistence across navigation
            savePrefillToSession(newName, newDept, newSem, newUsn);

            return {
              ...d,
              name: newName,
              department: newDept,
              semester: newSem,
              usn: newUsn,
            };
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
      if (!data.name.trim()) {
        toast.error("Please enter your full name.");
        return;
      }
      if (!data.department.trim()) {
        toast.error("Please enter your department.");
        return;
      }
      // USN is auto-filled from voter profile via sessionStorage + fetchVoterProfile
      // If USN is empty after loading, it may not be available in the voter's record — still allow proceeding
      if (!data.positionId) {
        toast.error("Please select a target position.");
        return;
      }
      if (!data.manifesto) {
        toast.error("Please write a campaign manifesto.");
        return;
      }
    }
    setStep((s) => s + 1);
  }

  async function submit() {
    if (!data.confirm || !data.terms) return;
    if (!data.positionId) {
      toast.error("Please select a target position.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { sessionToken } = getOtpSession();
      const mobileNum = sessionMobile || "9999999999";

      await registerCandidate(sessionToken, {
        position_id: data.positionId,
        manifesto: data.manifesto,
        mobile_number: mobileNum,
        new_password: data.newPassword || undefined,
        full_name: data.name || undefined,
        department: data.department || undefined,
        student_id: data.usn || undefined,
      });

      // Update auth context state
      setCandidateRegistered(true);
      login("candidate");

      toast.success("Application submitted successfully! Waiting for admin review.");
      nav({ to: "/candidate/dashboard" });
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
      toast.error(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-3xl bg-card rounded-2xl shadow-sm p-6 md:p-10">
        <h1 className="text-2xl font-bold">Candidate Registration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete all steps to submit your candidacy.
        </p>

        <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center shrink-0">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                  i < step
                    ? "bg-success/15 text-success"
                    : i === step
                      ? "bg-[#1F3A6E] text-white"
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

                {/* Live Password Strength Checklist */}
                <div className="mt-2 space-y-1.5 p-3.5 bg-muted/40 rounded-xl border border-border/60 text-xs">
                  <p className="font-semibold text-muted-foreground mb-1">
                    Password Strength Checklist:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div
                      className={cn(
                        "flex items-center gap-1.5",
                        data.newPassword.length >= 8
                          ? "text-green-600 dark:text-green-400 font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <span>{data.newPassword.length >= 8 ? "✓" : "○"}</span>
                      <span>At least 8 characters</span>
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1.5",
                        /[A-Z]/.test(data.newPassword)
                          ? "text-green-600 dark:text-green-400 font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <span>{/[A-Z]/.test(data.newPassword) ? "✓" : "○"}</span>
                      <span>At least 1 uppercase letter</span>
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1.5",
                        /[a-z]/.test(data.newPassword)
                          ? "text-green-600 dark:text-green-400 font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <span>{/[a-z]/.test(data.newPassword) ? "✓" : "○"}</span>
                      <span>At least 1 lowercase letter</span>
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1.5",
                        /[0-9]/.test(data.newPassword)
                          ? "text-green-600 dark:text-green-400 font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <span>{/[0-9]/.test(data.newPassword) ? "✓" : "○"}</span>
                      <span>At least 1 number</span>
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1.5",
                        /[@$!%*?&#_]/.test(data.newPassword)
                          ? "text-green-600 dark:text-green-400 font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <span>{/[@$!%*?&#_]/.test(data.newPassword) ? "✓" : "○"}</span>
                      <span>At least 1 special character</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Confirm New Password
                  </label>
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

          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name">
                <Input
                  value={data.name}
                  onChange={(e) => set("name", e.target.value)}
                  disabled={true}
                  className="bg-muted cursor-not-allowed opacity-70"
                  placeholder="e.g. John Doe"
                />
              </Field>
              <Field label="Department">
                <Input
                  value={data.department}
                  onChange={(e) => set("department", e.target.value)}
                  disabled={true}
                  className="bg-muted cursor-not-allowed opacity-70"
                  placeholder="e.g. Computer Science"
                />
              </Field>
              <Field label="Current Semester">
                <Input
                  value={data.semester}
                  onChange={(e) => set("semester", e.target.value)}
                  disabled={true}
                  className="bg-muted cursor-not-allowed opacity-70"
                  placeholder="e.g. 6th"
                />
              </Field>
              <Field label="USN / Student ID">
                <Input
                  value={data.usn}
                  onChange={(e) => set("usn", e.target.value)}
                  disabled={true}
                  className="bg-muted cursor-not-allowed opacity-70"
                  placeholder="e.g. 1RV21CS001"
                />
              </Field>
              <Field label="Target Election Position *">
                {positionsLoading ? (
                  <div className="h-11 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                    Loading available positions...
                  </div>
                ) : positionsError ? (
                  <div className="h-11 flex items-center px-3 rounded-md border border-destructive/50 bg-destructive/5 text-sm text-destructive">
                    Unable to load election positions.
                  </div>
                ) : positions.length === 0 ? (
                  <div className="h-11 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                    No active election positions available.
                  </div>
                ) : (
                  <Select
                    value={data.positionId}
                    onValueChange={(v) => set("positionId", v)}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select Position" />
                    </SelectTrigger>
                    <SelectContent>
                      {positions.map((p) => (
                        <SelectItem key={p.position_id} value={p.position_id}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Campaign Manifesto *">
                  <textarea
                    value={data.manifesto}
                    onChange={(e) => set("manifesto", e.target.value)}
                    placeholder="Describe your vision, goals, and campaign promises..."
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[120px]"
                  />
                </Field>
              </div>
              <UploadBox
                label="Candidate Photo"
                value={data.photo}
                onSet={(v) => set("photo", v)}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Terms & Conditions</h2>
              <p className="text-xs text-muted-foreground">
                Please read carefully — you must accept to continue.
              </p>
              <ol className="mt-3 space-y-2 max-h-[340px] overflow-y-auto pr-2 bg-muted/40 rounded-lg p-4 text-sm list-decimal list-inside">
                {TERMS.map((t, i) => (
                  <li key={i} className="leading-relaxed">
                    {t}
                  </li>
                ))}
              </ol>
              <label className="flex items-start gap-2 mt-4 cursor-pointer">
                <Checkbox
                  checked={data.terms}
                  onCheckedChange={(c) => set("terms", !!c)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  I have read and agree to all the terms and conditions above.
                </span>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Review your information</h2>
              <Row k="Name" v={data.name || "—"} />
              <Row k="Department" v={data.department || "—"} />
              <Row k="Semester" v={data.semester || "—"} />
              <Row
                k="Target Position"
                v={positions.find((p) => p.position_id === data.positionId)?.title || "—"}
              />
              <Row
                k="Manifesto"
                v={data.manifesto ? `${data.manifesto.substring(0, 100)}...` : "—"}
              />
              <Row k="Photo" v={data.photo || "Not uploaded"} />
              <Row k="Terms Accepted" v={data.terms ? "Yes" : "No"} />
              <label className="flex items-center gap-2 mt-5 cursor-pointer">
                <Checkbox checked={data.confirm} onCheckedChange={(c) => set("confirm", !!c)} />
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
              className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
              disabled={step === 2 && !data.terms}
              onClick={handleNext}
            >
              Next →
            </Button>
          ) : (
            <Button
              className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
              disabled={!data.confirm || !data.terms || loading}
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
      <span className="font-medium max-w-[70%] text-right overflow-hidden text-ellipsis whitespace-nowrap">
        {v}
      </span>
    </div>
  );
}

function UploadBox({
  label,
  value,
  onSet,
  simName,
}: {
  label: string;
  value: string;
  onSet: (v: string) => void;
  simName?: string;
}) {
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
          className="inline-flex items-center gap-2 text-xs text-[#6C63FF] font-medium"
        >
          <Upload className="h-4 w-4" /> Drag & drop or click
        </button>
      )}
    </div>
  );
}
