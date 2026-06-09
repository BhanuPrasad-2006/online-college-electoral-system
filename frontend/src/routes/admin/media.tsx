import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link as LinkIcon, Play, X } from "lucide-react";
import { PageLoader } from "@/components/PageLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resolveApiAssetUrl } from "@/lib/api";
import { reviewCampaignMedia } from "@/lib/demo-api";
import { useMediaItems } from "@/hooks/use-election-data";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/media")({ component: Page });

function Page() {
  const queryClient = useQueryClient();
  const { data: items = [], isPending } = useMediaItems();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [decisionLoading, setDecisionLoading] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  if (isPending) {
    return <PageLoader />;
  }

  const pending = items.filter((item: any) => item.status === "Pending");
  const approved = items.filter((item: any) => item.status === "Approved");
  const rejected = items.filter((item: any) => item.status === "Rejected");
  const groups = { pending, approved, rejected };

  async function handleDecision(id: string, status: "Approved" | "Rejected", reason?: string) {
    setDecisionLoading(id);
    try {
      await reviewCampaignMedia(id, status, reason);
      await queryClient.invalidateQueries({ queryKey: ["media"] });
      toast.success(
        status === "Approved" ? "Approved. Voters can now see this item." : "Submission rejected.",
      );
      setRejectingId(null);
      setRejectionReason("");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update campaign media.");
    } finally {
      setDecisionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Campaign Media Approval</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Candidate submissions arrive here first. Approve to publish for voters, or reject with a
          reason.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "pending" | "approved" | "rejected")}
      >
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejected.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {groups[tab].map((item: any) => {
              const assetUrl = resolveApiAssetUrl(
                item.uploadedFileUrl || item.externalUrl || item.url,
              );
              const isVideo = item.type === "video";

              return (
                <div
                  key={item.id}
                  className="bg-card rounded-2xl border border-border overflow-hidden"
                >
                  <div className="aspect-[16/9] bg-muted flex items-center justify-center overflow-hidden">
                    {assetUrl ? (
                      isVideo ? (
                        <video src={assetUrl} controls className="h-full w-full object-cover" />
                      ) : (
                        <img
                          src={assetUrl}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      )
                    ) : (
                      <Play className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.candidateName} • {item.type === "poster" ? "Media" : "Video"}
                        </p>
                      </div>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">
                      {formatSubmittedAt(item.submittedAt)}
                    </p>

                    {assetUrl ? (
                      <a
                        href={assetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-[#0F8A5F]"
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Open media
                      </a>
                    ) : null}

                    {item.rejectionReason ? (
                      <p className="mt-3 text-xs text-destructive">
                        Reason: {item.rejectionReason}
                      </p>
                    ) : null}

                    {item.status === "Pending" ? (
                      <div className="mt-4 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={decisionLoading === item.id}
                          onClick={() => {
                            setRejectingId(item.id);
                            setRejectionReason(item.rejectionReason || "");
                          }}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="bg-success text-white hover:bg-success/90"
                          disabled={decisionLoading === item.id}
                          onClick={() => handleDecision(item.id, "Approved")}
                        >
                          Approve
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {groups[tab].length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                No items in this queue.
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      {rejectingId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Reject Submission</h2>
              <button type="button" onClick={() => setRejectingId(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This reason will be shown back to the candidate.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              className="mt-4 min-h-28 w-full rounded-lg border border-border bg-transparent p-3 text-sm"
              placeholder="Enter rejection reason"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectingId(null)}>
                Cancel
              </Button>
              <Button
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={decisionLoading === rejectingId}
                onClick={() => handleDecision(rejectingId, "Rejected", rejectionReason.trim())}
              >
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatSubmittedAt(value?: string) {
  if (!value) return "Just now";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
