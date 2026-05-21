import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { MediaItem } from "@/lib/mock";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates, useMediaItems, useVoterConcerns } from "@/hooks/use-election-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Play, Image as ImageIcon, MessageSquare, Inbox } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/candidate/media")({ component: Page });

function Page() {
  const { data: candidates = [], isPending: loadingCandidates } = useCandidates();
  const { data: allMedia = [], isPending: loadingMedia } = useMediaItems();
  const { data: concerns = [], isPending: loadingConcerns } = useVoterConcerns();
  const me = candidates[0];

  const [type, setType] = useState<"video" | "poster" | "message">("video");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    if (me && allMedia.length) {
      setItems(allMedia.filter((m) => m.candidateId === me.id));
    }
  }, [me, allMedia]);

  if (loadingCandidates || loadingMedia || loadingConcerns || !me) return <PageLoader />;

  function submit() {
    if (!title.trim()) return toast.error("Title required");
    if (type === "message" && !body.trim()) return toast.error("Message required");
    if (type !== "message" && !file.trim()) return toast.error("File required");
    setTimeout(() => {
      setItems((s) => [
        {
          id: `m-${Date.now()}`,
          candidateId: me.id,
          candidateName: me.name,
          party: me.party,
          type,
          title,
          body: type === "message" ? body : undefined,
          url: type !== "message" ? file : undefined,
          status: "Pending",
          submittedAt: "Just now",
        },
        ...s,
      ]);
      setTitle(""); setBody(""); setFile("");
      toast.success("Submitted for admin approval");
    }, 400);
  }

  const incoming = concerns.filter((c) => c.toCandidateId === me.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Campaign Media</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload videos, posters, and messages. All content requires admin approval before going public.</p>
      </div>

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="my">My Submissions</TabsTrigger>
          <TabsTrigger value="concerns">Voter Concerns ({incoming.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-5">
          <div className="bg-card rounded-2xl shadow-sm p-5 md:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="poster">Poster</SelectItem>
                    <SelectItem value="message">Message</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="mt-1.5" />
              </div>
            </div>

            {type === "message" ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Message to voters</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={1500}
                  className="mt-1.5 w-full h-40 p-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-xs text-muted-foreground mt-2">{type === "video" ? "Upload MP4 (max 50MB)" : "Upload PNG/JPG"}</p>
                <button
                  onClick={() => setFile(type === "video" ? "campaign-video.mp4" : "campaign-poster.png")}
                  className="mt-3 text-sm text-[#6C63FF] font-medium"
                >
                  {file || "Choose file"}
                </button>
              </div>
            )}

            <Button onClick={submit} className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90">
              Submit for Approval
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="my" className="mt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((m) => {
              const Icon = m.type === "video" ? Play : m.type === "poster" ? ImageIcon : MessageSquare;
              const tone = m.status === "Approved" ? "bg-success text-white" : m.status === "Rejected" ? "bg-destructive text-white" : "bg-warning text-warning-foreground";
              return (
                <div key={m.id} className="bg-card rounded-2xl shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <Icon className="h-5 w-5 text-[#6C63FF]" />
                    <Badge className={tone}>{m.status}</Badge>
                  </div>
                  <p className="font-semibold text-sm">{m.title}</p>
                  {m.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{m.body}</p>}
                  {m.url && <p className="text-xs text-muted-foreground mt-1">{m.url}</p>}
                  <p className="text-[11px] text-muted-foreground mt-3 capitalize">{m.type} · {m.submittedAt}</p>
                </div>
              );
            })}
            {items.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="concerns" className="mt-5">
          <div className="bg-card rounded-2xl shadow-sm p-5 md:p-6 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Inbox className="h-5 w-5 text-[#6C63FF]" />
              <h2 className="text-base font-semibold">Concerns from Voters</h2>
            </div>
            {incoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No concerns yet.</p>
            ) : incoming.map((c) => (
              <div key={c.id} className="p-4 bg-muted/40 rounded-lg">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{c.fromName} · {c.department}</p>
                  <Badge variant="outline">{c.category}</Badge>
                </div>
                <p className="text-sm text-foreground/80 mt-2 whitespace-pre-line">{c.message}</p>
                <p className="text-[11px] text-muted-foreground mt-2">{c.submittedAt}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
