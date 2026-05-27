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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Upload,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Lock,
  Mail,
  User,
  FileText,
  Award,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  checkCandidateEligibility,
  verifyEligibilityOtp,
  fetchPositions,
  registerCandidate,
} from "@/lib/api";

export const Route = createFileRoute("/candidate/apply")({ component: Register });

const STEPS = [
  "Eligibility Check",
  "OTP Verification",
  "Select Position",
  "Basic Details",
  "Party Info",
  "Fee Payment",
  "Review & T&C",
];

function Register() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 0: Eligibility Inputs
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpSessionToken, setOtpSessionToken] = useState("");

  // Step 1: OTP Input
  const [otp, setOtp] = useState("");

  // Dynamic Positions list
  const [positions, setPositions] = useState<any[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState("");

  // Form Details
  const [formData, setFormData] = useState({
    name: "",
    department: "",
    semester: "",
    mobileNumber: "",
    partyName: "",
    partySymbolUrl: "https://api.dicebear.com/7.x/identicon/svg?seed=symbol",
    manifesto: "",
    paymentScreenshotUrl: "https://api.dicebear.com/7.x/identicon/svg?seed=payment",
    confirm: false,
    vicePresident: "",
    secretary: "",
  });

  const selectedPosition = positions.find((p) => p.position_id === selectedPositionId);
  const isPresident = selectedPosition?.title?.toLowerCase() === "president";

  const setFormValue = (key: string, val: any) => {
    setFormData((prev) => ({ ...prev, [key]: val }));
  };

  // Fetch positions on load or when entering position selection step
  useEffect(() => {
    async function loadPositions() {
      try {
        const data = await fetchPositions();
        setPositions(data);
      } catch (err: any) {
        console.error("Failed to load positions:", err);
      }
    }
    loadPositions();
  }, []);

  // Action handlers
  async function handleCheckEligibility() {
    if (!email || !password) {
      setError("Please enter your college email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await checkCandidateEligibility(email, password);
      setOtpSessionToken(res.otp_session_token);
      toast.success(res.message || "Eligibility verified! OTP sent to email.");
      setStep(1);
    } catch (err: any) {
      setError(err.message || "Eligibility check failed.");
      toast.error(err.message || "Eligibility check failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp || otp.length !== 6) {
      setError("Please enter the 6-digit OTP.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await verifyEligibilityOtp(otpSessionToken, otp);
      if (res.verified) {
        setFormData((prev) => ({
          ...prev,
          name: res.full_name,
          department: res.department,
          semester: res.semester,
          mobileNumber: res.mobile_number,
        }));
        toast.success("OTP verified successfully!");
        setStep(2);
      }
    } catch (err: any) {
      setError(err.message || "OTP verification failed.");
      toast.error(err.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!formData.confirm) {
      toast.error("Please confirm accuracy of the information.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await registerCandidate(otpSessionToken, {
        position_id: selectedPositionId,
        party_name: formData.partyName || "Independent",
        party_symbol_url: formData.partySymbolUrl,
        manifesto: formData.manifesto,
        payment_screenshot_url: formData.paymentScreenshotUrl,
        mobile_number: formData.mobileNumber,
        vice_president: isPresident ? formData.vicePresident : undefined,
        secretary: isPresident ? formData.secretary : undefined,
      });
      toast.success("Application submitted successfully!");
      nav({ to: "/candidate/status" });
    } catch (err: any) {
      setError(err.message || "Submission failed.");
      toast.error(err.message || "Submission failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-3xl bg-card rounded-2xl shadow-sm border border-border/60 p-6 md:p-10 relative overflow-hidden glass-panel">
        {/* Decorative elements */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#6C63FF]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#1F3A6E]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3 mb-2">
          <Award className="h-7 w-7 text-[#6C63FF]" />
          <h1 className="text-2xl font-bold">Candidate Application Form</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Complete the strict 7-stage registration process to apply.
        </p>

        {/* Progress Bar & Indicators */}
        <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-3 border-b border-border/40 scrollbar-none">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center shrink-0">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300",
                  i < step
                    ? "bg-success/10 text-success border border-success/20"
                    : i === step
                      ? "bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white shadow-md shadow-[#6C63FF]/20"
                      : "bg-muted text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold",
                    i === step ? "bg-white text-[#1F3A6E]" : "bg-muted-foreground/20 text-current",
                  )}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                {s}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn("w-4 h-[2px] mx-1", i < step ? "bg-success/40" : "bg-border/60")}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2.5 mt-5 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 animate-shake">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="mt-8 min-h-[300px]">
          {/* STEP 1: Eligibility Check */}
          {step === 0 && (
            <div className="space-y-5 max-w-md mx-auto">
              <div className="text-center mb-6">
                <Lock className="h-10 w-10 text-[#6C63FF] mx-auto mb-2" />
                <h3 className="text-lg font-semibold">Verify Voter Identity</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Only 3rd and 4th-year registered voters are eligible to contest.
                </p>
              </div>

              <div className="space-y-4">
                <Field label="College Email" icon={<Mail className="h-4 w-4" />}>
                  <Input
                    type="email"
                    placeholder="student@dsce.edu.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                  />
                </Field>
                <Field label="Voter Password" icon={<Lock className="h-4 w-4" />}>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                  />
                </Field>

                <Button
                  onClick={handleCheckEligibility}
                  disabled={loading}
                  className="w-full mt-4 bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white font-semibold hover:opacity-95 shadow-md"
                >
                  {loading ? "Checking Database..." : "Verify & Send OTP"}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: OTP Verification */}
          {step === 1 && (
            <div className="space-y-5 max-w-md mx-auto text-center">
              <Mail className="h-12 w-12 text-[#6C63FF] mx-auto mb-2 animate-bounce" />
              <h3 className="text-lg font-semibold">Enter 6-Digit Email OTP</h3>
              <p className="text-xs text-muted-foreground">
                We've sent a 6-digit confirmation code to{" "}
                <span className="font-semibold text-foreground">{email}</span>.
              </p>

              <div className="space-y-4 mt-6">
                <Input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="text-center text-lg tracking-[1em] font-mono h-12"
                />

                <Button
                  onClick={handleVerifyOtp}
                  disabled={loading}
                  className="w-full bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white font-semibold shadow-md"
                >
                  {loading ? "Verifying..." : "Verify OTP & Continue"}
                </Button>

                <button
                  onClick={() => setStep(0)}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Change Email or Credentials
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Position Selection */}
          {step === 2 && (
            <div className="space-y-6 max-w-md mx-auto">
              <div className="text-center mb-4">
                <Award className="h-10 w-10 text-[#6C63FF] mx-auto mb-2" />
                <h3 className="text-lg font-semibold">Choose Your Running Position</h3>
                <p className="text-xs text-muted-foreground">
                  Select the official council position you wish to contest for.
                </p>
              </div>

              <Field label="Target Position" icon={<User className="h-4 w-4" />}>
                <Select value={selectedPositionId} onValueChange={setSelectedPositionId}>
                  <SelectTrigger className="pl-10">
                    <SelectValue placeholder="Select Council Position" />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.map((pos) => (
                      <SelectItem key={pos.position_id} value={pos.position_id}>
                        {pos.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {selectedPositionId && (
                <div className="bg-muted/40 border border-border/40 p-4 rounded-xl text-xs space-y-2">
                  <p className="font-semibold text-foreground">Position Description:</p>
                  <p className="text-muted-foreground leading-relaxed">
                    {positions.find((p) => p.position_id === selectedPositionId)?.description ||
                      "No official description available."}
                  </p>
                </div>
              )}

              <Button
                onClick={() => {
                  if (!selectedPositionId) {
                    toast.error("Please select a position first.");
                    return;
                  }
                  setStep(3);
                }}
                className="w-full bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white font-semibold"
              >
                Proceed to Details
              </Button>
            </div>
          )}

          {/* STEP 4: Basic Details (Prefilled) */}
          {step === 3 && (
            <div className="space-y-5 max-w-md mx-auto">
              <div className="text-center mb-4">
                <User className="h-10 w-10 text-[#6C63FF] mx-auto mb-2" />
                <h3 className="text-lg font-semibold">Voter Profile Prefilled Info</h3>
                <p className="text-xs text-muted-foreground">
                  These details are synced directly from the voter database.
                </p>
              </div>

              <div className="space-y-3.5">
                <Field label="Full Name">
                  <Input value={formData.name} disabled className="bg-muted/50" />
                </Field>
                <Field label="Department">
                  <Input value={formData.department} disabled className="bg-muted/50" />
                </Field>
                <Field label="Semester/Year">
                  <Input value={formData.semester} disabled className="bg-muted/50" />
                </Field>
                <Field label="Mobile Number" icon={<Phone className="h-4 w-4" />}>
                  <Input
                    type="text"
                    value={formData.mobileNumber}
                    onChange={(e) => setFormValue("mobileNumber", e.target.value)}
                    className="pl-10"
                    placeholder="Enter candidate contact number"
                  />
                </Field>
                {isPresident && (
                  <>
                    <Field label="Vice President Name *">
                      <Input
                        type="text"
                        value={formData.vicePresident}
                        onChange={(e) => setFormValue("vicePresident", e.target.value)}
                        placeholder="Enter Vice President Name"
                      />
                    </Field>
                    <Field label="Secretary Name *">
                      <Input
                        type="text"
                        value={formData.secretary}
                        onChange={(e) => setFormValue("secretary", e.target.value)}
                        placeholder="Enter Secretary Name"
                      />
                    </Field>
                  </>
                )}

                <Button
                  onClick={() => {
                    if (!formData.mobileNumber) {
                      toast.error("Mobile number is required.");
                      return;
                    }
                    if (isPresident) {
                      if (!formData.vicePresident?.trim()) {
                        toast.error("Vice President name is required.");
                        return;
                      }
                      if (!formData.secretary?.trim()) {
                        toast.error("Secretary name is required.");
                        return;
                      }
                    }
                    setStep(4);
                  }}
                  className="w-full bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white font-semibold mt-4"
                >
                  Continue to Party & Manifesto
                </Button>
              </div>
            </div>
          )}

          {/* STEP 5: Party Info & Manifesto */}
          {step === 4 && (
            <div className="space-y-5 max-w-lg mx-auto">
              <div className="text-center mb-3">
                <FileText className="h-10 w-10 text-[#6C63FF] mx-auto mb-2" />
                <h3 className="text-lg font-semibold">Party Information & Manifesto</h3>
                <p className="text-xs text-muted-foreground">
                  Provide details about your student coalition group and political statement.
                </p>
              </div>

              <div className="space-y-4">
                <Field label="Party / Group Name (Write 'Independent' if not in a group)">
                  <Input
                    type="text"
                    placeholder="e.g. Students United Party"
                    value={formData.partyName}
                    onChange={(e) => setFormValue("partyName", e.target.value)}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <UploadBox
                    label="Party Symbol Image (optional)"
                    value={formData.partySymbolUrl ? "Symbol Uploaded" : ""}
                    onSet={(v) =>
                      setFormValue(
                        "partySymbolUrl",
                        "https://api.dicebear.com/7.x/identicon/svg?seed=" + v,
                      )
                    }
                  />
                  <UploadBox label="Candidate Photo" value="Photo Configured" onSet={() => {}} />
                </div>

                <Field label="Candidate Manifesto (Vision & Commitments Statement)">
                  <textarea
                    value={formData.manifesto}
                    onChange={(e) => setFormValue("manifesto", e.target.value)}
                    rows={4}
                    placeholder="Type your official manifesto. What positive changes will you bring?"
                    className="w-full p-3 border border-input bg-background rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C63FF]"
                  />
                </Field>

                <Button
                  onClick={() => {
                    if (!formData.manifesto || formData.manifesto.trim().length < 20) {
                      toast.error("Please provide a manifesto statement (min 20 characters).");
                      return;
                    }
                    setStep(5);
                  }}
                  className="w-full bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white font-semibold"
                >
                  Proceed to Payment
                </Button>
              </div>
            </div>
          )}

          {/* STEP 6: Fee Payment */}
          {step === 5 && (
            <div className="text-center space-y-5 max-w-md mx-auto">
              <h3 className="text-lg font-semibold">Pay Application Registration Fee</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                As per Election Committee guidelines, all candidates must pay a one-time refundable
                registration fee of <span className="font-bold text-foreground">₹500</span>.
              </p>

              <div className="inline-flex flex-col items-center bg-muted/30 border border-border/40 rounded-2xl p-6">
                <div className="h-44 w-44 bg-white border border-border/60 rounded-xl flex items-center justify-center shadow-inner">
                  <QrCode className="h-36 w-36 text-foreground" />
                </div>
                <p className="text-sm font-semibold mt-4 text-[#1F3A6E]">Scan to Pay via UPI</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">elections@dsce.upi</p>
              </div>

              <UploadBox
                label="Payment Screenshot Receipt"
                value={formData.paymentScreenshotUrl ? "Screenshot Uploaded" : ""}
                onSet={(v) =>
                  setFormValue(
                    "paymentScreenshotUrl",
                    "https://api.dicebear.com/7.x/identicon/svg?seed=" + v,
                  )
                }
              />

              <Button
                onClick={() => {
                  if (!formData.paymentScreenshotUrl) {
                    toast.error("Please upload payment screenshot.");
                    return;
                  }
                  setStep(6);
                }}
                className="w-full bg-[#1F3A6E] hover:bg-[#1F3A6E]/90 text-white font-semibold shadow-md"
              >
                Go to Final Review
              </Button>
            </div>
          )}

          {/* STEP 7: Review & Submit */}
          {step === 6 && (
            <div className="space-y-5">
              <h3 className="text-lg font-semibold border-b border-border/40 pb-2">
                Final Application Review
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Row k="Candidate Name" v={formData.name} />
                <Row k="Department" v={formData.department} />
                <Row k="Semester" v={formData.semester} />
                <Row
                  k="Position"
                  v={positions.find((p) => p.position_id === selectedPositionId)?.title || "—"}
                />
                {isPresident && (
                  <>
                    <Row k="Vice President" v={formData.vicePresident || "—"} />
                    <Row k="Secretary" v={formData.secretary || "—"} />
                  </>
                )}
                <Row k="Mobile" v={formData.mobileNumber} />
                <Row k="Party Group" v={formData.partyName || "Independent"} />
                <Row k="Payment Screenshot" v="Verified screenshot uploaded" />
              </div>

              <div className="bg-muted/40 p-4 rounded-xl text-xs space-y-2">
                <p className="font-semibold text-foreground">Manifesto Summary:</p>
                <p className="text-muted-foreground italic leading-relaxed">
                  "{formData.manifesto}"
                </p>
              </div>

              <label className="flex items-start gap-3 mt-5 cursor-pointer bg-muted/20 p-3 rounded-xl border border-border/40 select-none">
                <Checkbox
                  checked={formData.confirm}
                  onCheckedChange={(c) => setFormValue("confirm", !!c)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    Acknowledge Rules & Guidelines
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    I verify all information is accurate and declare my eligibility. I agree to
                    comply with all guidelines set by the Election Committee.
                  </p>
                </div>
              </label>

              <Button
                onClick={handleSubmit}
                disabled={!formData.confirm || loading}
                className="w-full bg-gradient-to-r from-success to-emerald-600 text-white font-bold h-12 shadow-lg shadow-success/15 hover:opacity-95"
              >
                {loading ? "Submitting Application..." : "Submit Candidacy Request"}
              </Button>
            </div>
          )}
        </div>

        {/* Back Button */}
        <div className="flex justify-between gap-3 mt-8 border-t border-border/40 pt-4">
          <Button
            variant="outline"
            disabled={step === 0 || loading}
            onClick={() => setStep((s) => s - 1)}
          >
            ← Back
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Stage {step + 1} of {STEPS.length}
          </span>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-foreground/80">{label}</label>
      <div className="relative flex items-center">
        {icon && <div className="absolute left-3.5 text-muted-foreground">{icon}</div>}
        {children}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between p-3 bg-muted/30 border border-border/30 rounded-xl text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-semibold text-foreground">{v}</span>
    </div>
  );
}

function UploadBox({
  label,
  value,
  onSet,
}: {
  label: string;
  value: string;
  onSet: (v: string) => void;
}) {
  return (
    <div className="border-2 border-dashed border-border/80 bg-muted/10 rounded-2xl p-5 text-center flex flex-col justify-center items-center gap-1 hover:border-[#6C63FF]/50 transition-colors">
      <p className="text-xs font-bold text-foreground/80">{label}</p>
      {value ? (
        <div className="flex items-center gap-1.5 text-success text-xs font-semibold mt-1">
          <CheckCircle2 className="h-4 w-4" /> {value}
        </div>
      ) : (
        <button
          onClick={() => onSet(`${label.toLowerCase().replace(/\s+/g, "-")}.png`)}
          className="inline-flex items-center gap-1.5 text-xs text-[#6C63FF] font-semibold mt-2 hover:underline"
        >
          <Upload className="h-4 w-4" /> Simulate Upload
        </button>
      )}
    </div>
  );
}
