import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates, useMediaItems } from "@/hooks/use-election-data";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Play, Image as ImageIcon, MessageSquare, FileText } from "lucide-react";

export const Route = createFileRoute("/voter/media")({ component: Page });

function Page() {
  const { data: mediaItems = [], isPending: loadingMedia } = useMediaItems();
  const { data: candidates = [], isPending: loadingCandidates } = useCandidates();
  const [tab, setTab] = useState("all");

  if (loadingMedia || loadingCandidates) return <PageLoader />;

  const approved = mediaItems.filter((m) => m.status === "Approved");

  const groups = {
    all: approved,
    video: approved.filter((m) => m.type === "video"),
    poster: approved.filter((m) => m.type === "poster"),
    message: approved.filter((m) => m.type === "message"),
    manifesto: candidates.map((c) => {
      const cId = c.candidate_id || c.id;
      const cName = c.full_name || c.name || "Candidate";
      return {
        id: `mf-${cId}`,
        candidateId: cId,
        candidateName: cName,
        party: c.party || c.party_symbol_url || "Independent",
        type: "manifesto" as const,
        title: `${cName} — Manifesto`,
        body: c.manifesto,
        status: "Approved" as const,
        submittedAt: "",
      };
    }),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Campaign Gallery</h1>
        <p className="text-sm text-muted-foreground mt-1">Manifestos, videos, posters, and messages from candidates.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="manifesto">Manifestos</TabsTrigger>
          <TabsTrigger value="video">Videos</TabsTrigger>
          <TabsTrigger value="poster">Posters</TabsTrigger>
          <TabsTrigger value="message">Messages</TabsTrigger>
        </TabsList>

        {(["all", "manifesto", "video", "poster", "message"] as const).map((k) => (
          <TabsContent key={k} value={k} className="mt-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups[k].map((m) => <MediaCard key={m.id} m={m} />)}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function MediaCard({ m }: { m: any }) {
  const initials = m.candidateName.split(" ").map((n: string) => n[0]).join("");
  const Icon = m.type === "video" ? Play : m.type === "poster" ? ImageIcon : m.type === "message" ? MessageSquare : FileText;
  const tone = m.type === "video" ? "bg-destructive/10 text-destructive" : m.type === "poster" ? "bg-warning/20 text-warning-foreground" : m.type === "message" ? "bg-[#6C63FF]/10 text-[#6C63FF]" : "bg-success/15 text-success";

  return (
    <div className="bg-card rounded-2xl shadow-sm overflow-hidden">
      {m.type === "video" && (
        <div className="aspect-video bg-muted flex items-center justify-center">
          <div className="h-14 w-14 rounded-full bg-background/90 flex items-center justify-center"><Play className="h-6 w-6 text-foreground ml-0.5" /></div>
        </div>
      )}
      {m.type === "poster" && (
        <div className="aspect-[4/5] bg-gradient-to-br from-[#6C63FF]/20 to-[#1F3A6E]/30 flex items-center justify-center">
          <ImageIcon className="h-16 w-16 text-foreground/40" />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4" /></span>
          <Badge variant="outline" className="capitalize text-[11px]">{m.type}</Badge>
        </div>
        <p className="font-semibold text-sm">{m.title}</p>
        {m.body && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-4">{m.body}</p>}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t">
          <Avatar className="h-7 w-7"><AvatarFallback className="bg-[#6C63FF]/10 text-[#6C63FF] text-[10px] font-semibold">{initials}</AvatarFallback></Avatar>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{m.candidateName}</p>
            <p className="text-[10px] text-muted-foreground italic truncate">{m.party}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
