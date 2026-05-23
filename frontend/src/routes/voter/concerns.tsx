import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { submitConcern } from "@/lib/demo-api";
import type { VoterConcern } from "@/lib/mock";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates, useVoterConcerns } from "@/hooks/use-election-data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquarePlus, Send, Paperclip, Image as ImageIcon, Video as VideoIcon, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/voter/concerns")({ component: Page });

const CATEGORIES = ["Wi-Fi & Infrastructure", "Placements", "Hostel Facilities", "Cafeteria", "Transportation", "Sports & Events", "Mental Health", "Other"];

function Page() {
  const { data: candidates = [], isPending: loadingCandidates } = useCandidates();
  const { data: initialConcerns = [], isPending: loadingConcerns } = useVoterConcerns();
  const [candidateId, setCandidateId] = useState("");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<VoterConcern[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; url: string; type: string } | null>(null);

  if (loadingCandidates || loadingConcerns) return <PageLoader />;

  const concerns = (sent.length > 0 ? sent : initialConcerns) as any[];

  async function submit() {
    if (!candidateId || !category || !subject.trim() || !message.trim()) {
      toast.error("Please complete all fields (including candidate selection)");
      return;
    }
    setSubmitting(true);
    try {
      const created = await submitConcern({ toCandidateId: candidateId, category, subject, message });
      // Attach the local attachment details to render dynamically
      const withAttachment = {
        ...created,
        attachment: attachment ? { name: attachment.name, url: attachment.url, type: attachment.type } : undefined
      };
      setSent((s) => [withAttachment, ...s.length ? s : initialConcerns]);
      setCategory("");
      setSubject("");
      setMessage("");
      setCandidateId("");
      setAttachment(null);
      toast.success("Concern delivered to candidate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Send a Concern</h1>
        <p className="text-sm text-muted-foreground mt-1">Share campus issues directly with candidates. They review concerns to shape their manifesto.</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquarePlus className="h-5 w-5 text-[#6C63FF]" />
          <h2 className="text-base font-semibold">New Concern</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Send To</label>
            <Select value={candidateId} onValueChange={setCandidateId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select candidate" /></SelectTrigger>
              <SelectContent>
                {candidates.map((c) => {
                  const cId = c.candidate_id || c.id;
                  const cName = c.full_name || c.name;
                  return (
                    <SelectItem key={cId} value={cId}>
                      {cName} — {c.position}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Subject</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Short summary" className="mt-1.5" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            placeholder="Describe the problem and what you'd like the candidate to address..."
            className="mt-1.5 w-full h-32 p-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-[11px] text-muted-foreground mt-1">{message.length}/1000</p>
        </div>

        {/* ── File Attachment Section ── */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Attach Evidence (Photo or Video)</label>
          <div className="flex items-center gap-3 mt-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="relative cursor-pointer flex items-center gap-1.5 h-9"
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              <Paperclip className="h-4 w-4" />
              <span>Choose File</span>
            </Button>
            <input
              id="file-upload"
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const url = URL.createObjectURL(file);
                  setAttachment({
                    name: file.name,
                    url,
                    type: file.type,
                  });
                }
              }}
            />
            {attachment ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted px-2.5 py-1.5 rounded-md border border-border">
                {attachment.type.startsWith("image/") ? (
                  <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
                ) : (
                  <VideoIcon className="h-3.5 w-3.5 text-green-500" />
                )}
                <span className="max-w-[150px] truncate">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Supports images and videos up to 10MB</span>
            )}
          </div>
        </div>

        <Button onClick={submit} disabled={submitting} className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90 mt-2">
          <Send className="h-4 w-4 mr-2" /> Send Concern
        </Button>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5 md:p-6">
        <h2 className="text-base font-semibold mb-4">Recently Sent</h2>
        <div className="space-y-3">
          {concerns.map((c) => {
            const to = candidates.find((x) => (x.candidate_id || x.id) === (c.toCandidateId || c.to_candidate_id));
            const toName = to ? (to.full_name || to.name) : "—";
            return (
              <div key={c.id} className="p-4 bg-muted/40 rounded-lg">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold">To: {toName}</p>
                  <Badge variant="outline">{c.category}</Badge>
                </div>
                <p className="text-sm text-foreground/80 mt-2 whitespace-pre-line">{c.message}</p>

                {/* Render attachment if present */}
                {c.attachment && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background max-w-md">
                    {c.attachment.type.startsWith("image/") ? (
                      <img src={c.attachment.url} alt="Concern Attachment" className="max-h-64 w-full object-cover" />
                    ) : c.attachment.type.startsWith("video/") ? (
                      <video src={c.attachment.url} controls className="max-h-64 w-full object-cover" />
                    ) : (
                      <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                        <Paperclip className="h-4 w-4" /> {c.attachment.name}
                      </div>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground mt-2">{c.submittedAt}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
