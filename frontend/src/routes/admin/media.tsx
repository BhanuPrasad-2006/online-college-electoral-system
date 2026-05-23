import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { MediaItem } from "@/lib/mock";
import { PageLoader } from "@/components/PageLoader";
import { useMediaItems } from "@/hooks/use-election-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { 
  Play, 
  Image as ImageIcon, 
  MessageSquare, 
  FileText, 
  Check, 
  X, 
  ExternalLink,
  AlertCircle
} from "lucide-react";
import { reviewCampaignMedia } from "@/lib/demo-api"; // delegates to live api
import { toast } from "sonner";

export const Route = createFileRoute("/admin/media")({ component: Page });

function Page() {
  const { data: media = [], isPending, refetch } = useMediaItems();
  const [items, setItems] = useState<MediaItem[]>([]);
  
  // Moderation state
  const [rejectionMediaId, setRejectionMediaId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    if (media.length) setItems(media);
  }, [media]);

  if (isPending && !items.length) return <PageLoader />;

  async function handleApprove(mediaId: string) {
    try {
      setDeciding(true);
      await reviewCampaignMedia(mediaId, "Approved");
      toast.success("Approved — visible to voters");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve media");
    } finally {
      setDeciding(false);
    }
  }

  async function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectionMediaId) return;
    if (!rejectionReason.trim()) {
      toast.error("Please enter a reason for rejection.");
      return;
    }
    try {
      setDeciding(true);
      await reviewCampaignMedia(rejectionMediaId, "Rejected", rejectionReason.trim());
      toast.success("Rejected successfully.");
      setRejectionMediaId(null);
      setRejectionReason("");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject media");
    } finally {
      setDeciding(false);
    }
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {list.map((m) => (
                  <Row 
                    key={m.id} 
                    m={m} 
                    onApprove={handleApprove} 
                    onRejectInit={(id) => setRejectionMediaId(id)}
                    disabled={deciding} 
                  />
                ))}
                {list.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Rejection Modal overlay */}
      {rejectionMediaId && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-lg max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div>
              <h3 className="font-semibold text-lg">Reason for Rejection</h3>
              <p className="text-xs text-muted-foreground mt-1">Please provide feedback or specific reasons why this campaign material is rejected. This will be shown to the candidate.</p>
            </div>
            
            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Disallowed language, copyrighted material, or incorrect file format..."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[100px]"
                required
              />
              
              <div className="flex gap-2 justify-end">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setRejectionMediaId(null);
                    setRejectionReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={deciding}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/95"
                >
                  Confirm Rejection
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ 
  m, 
  onApprove, 
  onRejectInit,
  disabled 
}: { 
  m: any; 
  onApprove: (id: string) => void; 
  onRejectInit: (id: string) => void;
  disabled: boolean;
}) {
  const Icon = m.type === "video" ? Play : m.type === "poster" ? ImageIcon : m.type === "message" ? MessageSquare : FileText;
  
  const isApproved = m.status === "Approved";
  const isRejected = m.status === "Rejected";
  const isPending = m.status === "Pending";

  const tone = isApproved 
    ? "bg-success/15 text-success border-success/20" 
    : isRejected 
    ? "bg-destructive/15 text-destructive border-destructive/20" 
    : "bg-warning/15 text-warning-foreground border-warning/20";
    
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm flex flex-col justify-between overflow-hidden">
      <div>
        {/* Media Asset Preview */}
        {m.type === "poster" && (m.uploadedFileUrl || m.externalUrl) && (
          <div className="aspect-[16/8] bg-muted relative overflow-hidden flex items-center justify-center border-b border-border">
            <img 
              src={m.uploadedFileUrl || m.externalUrl} 
              alt={m.title}
              className="object-cover h-full w-full"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/5">
              <ImageIcon className="h-8 w-8 text-white/50" />
            </div>
          </div>
        )}

        {m.type === "video" && (
          <div className="aspect-[16/8] bg-black/95 flex flex-col items-center justify-center p-4 border-b border-border relative">
            <Play className="h-8 w-8 text-white/60 mb-1" />
            <span className="text-[10px] text-white/50 truncate max-w-full font-mono">
              {m.uploadedFileUrl || m.externalUrl}
            </span>
          </div>
        )}

        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-10 w-10 rounded-xl bg-[#6C63FF]/10 text-[#6C63FF] flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold truncate text-sm leading-snug">{m.title}</p>
                <p className="text-xs text-muted-foreground truncate">{m.candidateName} · <span className="italic">{m.party}</span></p>
              </div>
            </div>
            <Badge variant="outline" className={`capitalize shrink-0 text-[10px] px-2 py-0.5 rounded-full ${tone}`}>
              {m.status}
            </Badge>
          </div>

          {m.body && <p className="text-xs text-foreground/80 leading-relaxed bg-muted/30 rounded-xl p-3.5 border border-border/40 mt-3 whitespace-pre-wrap">{m.body}</p>}
          
          {(m.uploadedFileUrl || m.externalUrl) && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#6C63FF] font-medium mt-3">
              <ExternalLink className="h-3.5 w-3.5" />
              <a 
                href={m.uploadedFileUrl || m.externalUrl} 
                target="_blank" 
                rel="noreferrer"
                className="hover:underline truncate max-w-[300px]"
              >
                Open Media Attachment Link
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 pt-3 border-t border-border/55 flex items-center justify-between mt-auto">
        <p className="text-[10px] text-muted-foreground capitalize">{m.type} · Submitted {m.submittedAt}</p>
        
        {isPending && (
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onRejectInit(m.id)}
              disabled={disabled}
              className="text-xs h-8"
            >
              <X className="h-3.5 w-3.5 mr-1 text-destructive" /> Reject
            </Button>
            <Button 
              size="sm" 
              onClick={() => onApprove(m.id)}
              disabled={disabled}
              className="bg-success text-white hover:bg-success/90 text-xs h-8"
            >
              <Check className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
          </div>
        )}
      </div>

      {isRejected && m.rejectionReason && (
        <div className="mx-5 mb-5 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex gap-2 items-start text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-[11px]">Rejection Reason:</span>
            <p className="mt-0.5">{m.rejectionReason}</p>
          </div>
        </div>
      )}
    </div>
  );
}
