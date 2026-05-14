import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MEDIA_ITEMS, type MediaItem } from "@/lib/mock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Play, Image as ImageIcon, MessageSquare, FileText, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/media")({ component: Page });

function Page() {
  const [items, setItems] = useState<MediaItem[]>(MEDIA_ITEMS);

  function decide(id: string, status: "Approved" | "Rejected") {
    setItems((s) => s.map((m) => (m.id === id ? { ...m, status } : m)));
    toast.success(status === "Approved" ? "Approved — visible to voters" : "Rejected");
  }

  const pending = items.filter((m) => m.status === "Pending");
  const approved = items.filter((m) => m.status === "Approved");
  const rejected = items.filter((m) => m.status === "Rejected");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Approve Campaign Content</h1>
        <p className="text-sm text-muted-foreground mt-1">Review manifestos, videos, posters, and messages before they appear to voters.</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejected.length})</TabsTrigger>
        </TabsList>

        {(["pending", "approved", "rejected"] as const).map((k) => {
          const list = k === "pending" ? pending : k === "approved" ? approved : rejected;
          return (
            <TabsContent key={k} value={k} className="mt-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {list.map((m) => <Row key={m.id} m={m} onDecide={decide} />)}
                {list.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function Row({ m, onDecide }: { m: MediaItem; onDecide: (id: string, s: "Approved" | "Rejected") => void }) {
  const Icon = m.type === "video" ? Play : m.type === "poster" ? ImageIcon : m.type === "message" ? MessageSquare : FileText;
  const tone = m.status === "Approved" ? "bg-success text-white" : m.status === "Rejected" ? "bg-destructive text-white" : "bg-warning text-warning-foreground";
  return (
    <div className="bg-card rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-10 w-10 rounded-xl bg-[#6C63FF]/10 text-[#6C63FF] flex items-center justify-center"><Icon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="font-semibold truncate">{m.title}</p>
            <p className="text-xs text-muted-foreground truncate">{m.candidateName} · <span className="italic">{m.party}</span></p>
          </div>
        </div>
        <Badge className={tone}>{m.status}</Badge>
      </div>
      {m.body && <p className="text-sm text-foreground/80 mt-3 leading-relaxed">{m.body}</p>}
      {m.url && <p className="text-xs text-muted-foreground mt-3">📎 {m.url}</p>}
      <div className="flex items-center justify-between mt-4 pt-3 border-t">
        <p className="text-[11px] text-muted-foreground capitalize">{m.type} · {m.submittedAt}</p>
        {m.status === "Pending" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onDecide(m.id, "Rejected")}>
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button size="sm" className="bg-success text-white hover:bg-success/90" onClick={() => onDecide(m.id, "Approved")}>
              <Check className="h-4 w-4 mr-1" /> Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
