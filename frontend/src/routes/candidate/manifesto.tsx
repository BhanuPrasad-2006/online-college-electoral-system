import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Bold, Italic, List, Heading, Check, X, AlertCircle, Upload, Image, FileText, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { fetchCandidateProfile, saveManifesto, uploadManifestoMedia, analyzeAndStoreManifesto } from "@/lib/api";

interface Contradiction {
  statement_a: string;
  statement_b: string;
  explanation: string;
  severity: "minor" | "moderate" | "severe";
}

function severityColor(severity: string) {
  if (severity === "severe") return "bg-red-100 text-red-800 border-red-200";
  if (severity === "moderate") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-yellow-50 text-yellow-700 border-yellow-100";
}

function severityLabel(severity: string) {
  if (severity === "severe") return "High";
  if (severity === "moderate") return "Medium";
  return "Low";
}

function statusBadgeClass(status: string) {
  if (status === "Approved") return "bg-success text-white";
  if (status === "Rejected") return "bg-destructive text-white";
  if (status === "Pending Review") return "bg-warning text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

function Page() {
  const [text, setText] = useState("");
  const [manifestoStatus, setManifestoStatus] = useState("Not Submitted");
  const [adminRemarks, setAdminRemarks] = useState<string | null>(null);
  const [candidateStatus, setCandidateStatus] = useState("");
  const [cats, setCats] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [overall, setOverall] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manifestoImageUrl, setManifestoImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await fetchCandidateProfile();
        if (!mounted) return;
        setText(me.manifesto || "");
        setManifestoStatus(me.manifesto_status || "Not Submitted");
        setAdminRemarks(me.manifesto_admin_remarks ?? null);
        setCandidateStatus(me.status || "");
        setManifestoImageUrl(me.manifesto_image_url || null);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function analyze() {
    try {
      const data = await analyzeAndStoreManifesto(text);

      const themes: string[] = Array.isArray(data.key_themes) ? data.key_themes : [];
      setCats(themes.slice(0, 6).map((t) => ({ name: t, coverage: 100, covered: true })));
      setSuggestions(themes.slice(0, 3).map((t) => `Add: ${t} Plan`));
      const score = typeof data.feasibility_score === "number" ? data.feasibility_score : 0;
      setOverall(Math.max(0, Math.min(100, Math.round(score * 100))));

      const raw = Array.isArray(data.contradictions) ? data.contradictions : [];
      setContradictions(raw as Contradiction[]);

      toast.success("Analysis saved to your manifesto");
    } catch (e: any) {
      toast.error(e?.message || "Could not analyze manifesto");
    }
  }

  async function uploadImage() {
    const file = selectedImage || fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("Please select an image or PDF to upload");
      return;
    }
    setImageUploading(true);
    try {
      const result = await uploadManifestoMedia(file);
      setManifestoImageUrl(result.url);
      setImageRemoved(false);
      toast.success("Media uploaded successfully");
      setSelectedImage(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      toast.error(e?.message || "Failed to upload media");
    } finally {
      setImageUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    // Show preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  }

  function removeImage() {
    setManifestoImageUrl(null);
    setSelectedImage(null);
    setImagePreview(null);
    setImageRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function persist(submit: boolean) {
    if (!text.trim()) {
      toast.error("Please write your manifesto first");
      return;
    }
    if (submit && candidateStatus !== "Approved") {
      toast.error("Your candidate application must be approved before submitting your manifesto.");
      return;
    }
    if (submit) setSubmitting(true);
    else setSaving(true);
    try {
      // If image was explicitly removed, pass empty string to clear it in DB
      const imageUrlToSave = imageRemoved ? "" : (manifestoImageUrl ?? undefined);
      const res = await saveManifesto(text, submit, imageUrlToSave);
      setImageRemoved(false);
      setManifestoStatus(res.manifesto_status);
      if (submit) {
        setAdminRemarks(null);
        toast.success("Manifesto submitted for admin approval");
      } else {
        toast.success("Draft saved");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not save manifesto");
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  }

  const isLocked = manifestoStatus === "Pending Review" || manifestoStatus === "Approved";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Manifesto Editor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Save a draft, then submit for admin approval. Voters only see approved manifestos.
          </p>
        </div>
        <Badge className={statusBadgeClass(manifestoStatus)}>{manifestoStatus}</Badge>
      </div>

      {manifestoStatus === "Rejected" && adminRemarks && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex gap-2">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">Manifesto rejected</p>
            <p className="text-sm text-muted-foreground mt-1">{adminRemarks}</p>
            <p className="text-xs text-muted-foreground mt-2">Edit your manifesto and submit again for review.</p>
          </div>
        </div>
      )}

      {manifestoStatus === "Pending Review" && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 text-sm">
          Your manifesto is awaiting admin approval. You cannot edit it until it is reviewed.
        </div>
      )}

      {manifestoStatus === "Approved" && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-4 text-sm text-success">
          Your manifesto is approved and visible to all voters.
        </div>
      )}

      <div className="bg-card rounded-2xl shadow-sm p-4 flex items-center gap-3">
        <span className="text-sm font-medium">Coverage:</span>
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-[#6C63FF]" style={{ width: `${overall}%` }} />
        </div>
        <span className="text-sm font-bold tabular-nums">{overall}%</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-card rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-1 pb-3 border-b border-border mb-3">
            {[Bold, Italic, List, Heading].map((I, i) => (
              <button key={i} type="button" className="p-2 hover:bg-muted rounded-md" disabled={isLocked}>
                <I className="h-4 w-4" />
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isLocked}
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={isLocked}
                onClick={() => fileInputRef.current?.click()}
                className="text-xs gap-1"
              >
                <Image className="h-3.5 w-3.5" />
                {manifestoImageUrl ? "Change" : "Add Image"}
              </Button>
            </div>
          </div>

          {/* Image preview / upload area */}
          {(imagePreview || manifestoImageUrl) && (
            <div className="relative mb-3 rounded-lg overflow-hidden border border-border bg-muted/30">
              <img
                src={imagePreview || manifestoImageUrl || ""}
                alt="Manifesto media preview"
                className="w-full max-h-48 object-contain"
              />
              <div className="absolute top-2 right-2 flex gap-1">
                {imagePreview && !manifestoImageUrl && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs gap-1"
                    disabled={imageUploading}
                    onClick={uploadImage}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {imageUploading ? "Uploading..." : "Upload to Supabase"}
                  </Button>
                )}
                {!isLocked && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 w-8 p-0"
                    onClick={removeImage}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {manifestoImageUrl && !imagePreview && (
            <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2">
              <Image className="h-3.5 w-3.5" />
              <span className="truncate flex-1">{manifestoImageUrl.split("/").pop()}</span>
              {!isLocked && (
                <button onClick={removeImage} className="text-destructive hover:underline">
                  Remove
                </button>
              )}
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLocked}
            className="w-full h-[420px] resize-none text-sm leading-relaxed focus:outline-none bg-transparent font-mono disabled:opacity-60"
          />
          <div className="flex items-center justify-between pt-3 border-t border-border flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">{text.length} characters</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={analyze} disabled={isLocked}>Analyze</Button>
              <Button variant="outline" size="sm" disabled={saving || isLocked} onClick={() => persist(false)}>
                {saving ? "Saving..." : "Save Draft"}
              </Button>
              <Button
                size="sm"
                className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
                disabled={submitting || isLocked}
                onClick={() => persist(true)}
              >
                {submitting ? "Submitting..." : "Submit for Approval"}
              </Button>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-2 bg-card rounded-2xl shadow-sm p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-[#6C63FF]" />
            <h2 className="text-base font-semibold">AI Recommendations</h2>
          </div>
          <div className="space-y-2">
            {cats.map((c) => (
              <div key={c.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {c.covered ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}
                    <span>{c.name}</span>
                  </div>
                  <span className={c.covered ? "text-success text-xs font-medium" : "text-destructive text-xs font-medium"}>{c.coverage}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={c.covered ? "h-full bg-success" : "h-full bg-destructive"} style={{ width: `${c.coverage}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Suggested Additions</h3>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={isLocked}
                  onClick={() => setText((t) => t + `\n\n${s.replace("Add: ", "## ")}\n[Outline a concrete plan here]\n`)}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-[#6C63FF]/10 text-[#6C63FF] hover:bg-[#6C63FF]/15 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {contradictions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold">Contradictions Detected</h3>
              </div>
              <div className="space-y-2">
                {contradictions.map((c, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 text-xs space-y-1.5 ${severityColor(c.severity)}`}
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-auto">
                        {severityLabel(c.severity)} Priority
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-[11px]">Statement A:</p>
                      <p className="italic">&ldquo;{c.statement_a}&rdquo;</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-[11px]">Statement B:</p>
                      <p className="italic">&ldquo;{c.statement_b}&rdquo;</p>
                    </div>
                    <p className="text-muted-foreground mt-1">{c.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/candidate/manifesto")({ component: Page });
