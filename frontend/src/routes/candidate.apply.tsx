import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUpload, type FileUploadValue } from "@/components/FileUpload";

export const Route = createFileRoute("/candidate/apply")({ component: Register });

const STEPS = ["Basic Details", "Payment", "Review"];

function Register() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<{
    name: string; department: string; semester: string; party: string;
    symbol: FileUploadValue; photo: FileUploadValue; payment: FileUploadValue;
    confirm: boolean;
  }>({
    name: "", department: "", semester: "", party: "",
    symbol: null, photo: null, payment: null, confirm: false,
  });
  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));

  function submit() {
    if (!data.confirm) return;
    setTimeout(() => {
      toast.success("Application submitted successfully");
      nav({ to: "/candidate/status" });
    }, 500);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-3xl bg-card rounded-2xl shadow-sm p-6 md:p-10">
        <h1 className="text-2xl font-bold">Candidate Registration</h1>
        <p className="text-sm text-muted-foreground mt-1">Complete all steps to submit your candidacy.</p>

        <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center shrink-0">
              <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                i < step ? "bg-success/15 text-success" : i === step ? "bg-[#1F3A6E] text-white" : "bg-muted text-muted-foreground"
              )}>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name"><Input value={data.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Department">
                <Select value={data.department} onValueChange={(v) => set("department", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {["CSE", "ECE", "ME", "Civil", "MBA", "MCA"].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Current Semester">
                <Select value={data.semester} onValueChange={(v) => set("semester", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Party / Group Name (optional)"><Input value={data.party} onChange={(e) => set("party", e.target.value)} /></Field>
              <FileUpload label="Party Symbol" value={data.symbol} onChange={(v) => set("symbol", v)} />
              <FileUpload label="Candidate Photo" value={data.photo} onChange={(v) => set("photo", v)} />
            </div>
          )}

          {step === 1 && (
            <div className="text-center">
              <h2 className="text-base font-semibold">Pay Registration Fee</h2>
              <div className="mt-5 inline-flex flex-col items-center bg-muted/40 rounded-xl p-6">
                <div className="h-44 w-44 bg-white border border-border rounded-lg flex items-center justify-center">
                  <QrCode className="h-32 w-32 text-foreground" />
                </div>
                <p className="text-sm font-medium mt-4">Scan to pay ₹500 via UPI</p>
                <p className="text-xs text-muted-foreground mt-1">UPI ID: elections@college.upi</p>
              </div>
              <div className="mt-6 max-w-sm mx-auto">
                <FileUpload label="Payment Screenshot" value={data.payment} onChange={(v) => set("payment", v)} />
              </div>
              <p className="text-xs text-muted-foreground mt-4 italic">
                Your application will be reviewed after payment verification.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Review your information</h2>
              <Row k="Name" v={data.name || "—"} />
              <Row k="Department" v={data.department || "—"} />
              <Row k="Semester" v={data.semester || "—"} />
              <Row k="Party" v={data.party || "Independent"} />
              <Row k="Party Symbol" v={data.symbol?.name || "Not uploaded"} />
              <Row k="Photo" v={data.photo?.name || "Not uploaded"} />
              <Row k="Payment Screenshot" v={data.payment?.name || "Not uploaded"} />
              <label className="flex items-center gap-2 mt-5 cursor-pointer">
                <Checkbox checked={data.confirm} onCheckedChange={(c) => set("confirm", !!c)} />
                <span className="text-sm">I confirm all the above information is accurate</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-3 mt-8">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>← Back</Button>
          {step < STEPS.length - 1 ? (
            <Button className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90" onClick={() => setStep((s) => s + 1)}>Next →</Button>
          ) : (
            <Button className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90" disabled={!data.confirm} onClick={submit}>
              Submit Application
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
      <span className="font-medium">{v}</span>
    </div>
  );
}
