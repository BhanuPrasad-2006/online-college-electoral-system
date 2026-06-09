import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/PageLoader";
import { fetchManifestosForAdmin, reviewManifesto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FileText } from "lucide-react";
import { toast } from "sonner";

const FILTERS = ["All", "pending", "approved", "rejected", "draft"];

function Page() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [preview, setPreview] = useState<any | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data: items = [], isPending } = useQuery({
    queryKey: ["admin-manifestos", filter],
    queryFn: () => fetchManifestosForAdmin(filter === "All" ? undefined : filter),
  });

  async function handleApprove(manifestoId: string, name: string) {
    setLoadingId(manifestoId);
    try {
      await reviewManifesto(manifestoId, "approved");
      toast.success(`Manifesto for ${name} approved — visible to voters`);
      await queryClient.invalidateQueries({ queryKey: ["admin-manifestos"] });
      await queryClient.invalidateQueries({ queryKey: ["candidates"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to approve");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleRejectConfirm() {
    if (!rejectId) return;
    setLoadingId(rejectId);
    try {
      await reviewManifesto(rejectId, "rejected", reason);
      toast.success("Manifesto rejected");
      await queryClient.invalidateQueries({ queryKey: ["admin-manifestos"] });
      setRejectId(null);
      setReason("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to reject");
    } finally {
      setLoadingId(null);
    }
  }

  if (isPending) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Manifesto Approval</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review candidate manifestos. Only approved manifestos are visible to voters.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap capitalize ${
              filter === f ? "bg-[#0F8A5F] text-white" : "bg-muted"
            }`}
          >
            {f === "All" ? "All" : f}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="p-4">Candidate</th>
              <th className="p-4">Position</th>
              <th className="p-4">Candidate status</th>
              <th className="p-4">Manifesto status</th>
              <th className="p-4">Submitted</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No manifestos in this category.
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.manifesto_id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-4 font-medium">{m.full_name}</td>
                  <td className="p-4">{m.position}</td>
                  <td className="p-4">{m.candidate_status}</td>
                  <td className="p-4">
                    <Badge
                      className={
                        m.manifesto_status === "Approved"
                          ? "bg-success text-white"
                          : m.manifesto_status === "Rejected"
                            ? "bg-destructive text-white"
                            : m.manifesto_status === "Pending Review"
                              ? "bg-warning text-warning-foreground"
                              : "bg-muted"
                      }
                    >
                      {m.manifesto_status}
                    </Badge>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">
                    {m.submitted_at ? new Date(m.submitted_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPreview(m)}>
                        Read
                      </Button>
                      {m.manifesto_status === "Pending Review" && (
                        <>
                          <Button
                            size="sm"
                            className="bg-success text-white hover:bg-success/90"
                            disabled={!!loadingId}
                            onClick={() => handleApprove(m.manifesto_id, m.full_name)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!loadingId}
                            onClick={() => setRejectId(m.manifesto_id)}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!preview} onOpenChange={(b) => !b && setPreview(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {preview && (
            <>
              <DialogTitle>{preview.full_name} — Manifesto Review</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {preview.position} · {preview.department} · {preview.manifesto_status}
              </p>

              {/* AI Analysis Flags — Side-by-side with content */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                {/* Left: Manifesto Content */}
                <div className="lg:col-span-2 space-y-3">
                  {preview.image_url && (
                    <div className="rounded-lg overflow-hidden border border-border">
                      {preview.image_url.match(/\.pdf$/i) ? (
                        <a
                          href={preview.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-4 bg-muted/20 hover:bg-muted/40 transition-colors"
                        >
                          <FileText className="h-6 w-6 text-[#0F8A5F]" />
                          <span className="text-sm font-medium">View Attached PDF</span>
                        </a>
                      ) : (
                        <img
                          src={preview.image_url}
                          alt="Manifesto media"
                          className="w-full max-h-60 object-contain bg-muted/20"
                        />
                      )}
                    </div>
                  )}
                  <div className="bg-muted/20 rounded-lg p-4 border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Manifesto Text
                    </p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{preview.content}</p>
                  </div>
                </div>

                {/* Right: AI Analysis Panel */}
                <div className="space-y-3">
                  {preview.ai_analysis && (
                    <>
                      {/* Feasibility Score */}
                      {preview.ai_analysis.feasibility_score !== null &&
                        preview.ai_analysis.feasibility_score !== undefined && (
                          <div className="bg-card border rounded-lg p-3">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Feasibility
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    preview.ai_analysis.feasibility_score >= 0.7
                                      ? "bg-emerald-500"
                                      : preview.ai_analysis.feasibility_score >= 0.4
                                        ? "bg-amber-500"
                                        : "bg-destructive"
                                  }`}
                                  style={{
                                    width: `${preview.ai_analysis.feasibility_score * 100}%`,
                                  }}
                                />
                              </div>
                              <span className="text-sm font-bold">
                                {(preview.ai_analysis.feasibility_score * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        )}

                      {/* Sentiment Score */}
                      {preview.ai_analysis.sentiment_score !== null &&
                        preview.ai_analysis.sentiment_score !== undefined && (
                          <div className="bg-card border rounded-lg p-3">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Sentiment
                            </p>
                            <p
                              className={`text-lg font-bold mt-0.5 ${
                                preview.ai_analysis.sentiment_score > 0.2
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : preview.ai_analysis.sentiment_score < -0.2
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {preview.ai_analysis.sentiment_score > 0.2
                                ? "Positive"
                                : preview.ai_analysis.sentiment_score < -0.2
                                  ? "Negative"
                                  : "Neutral"}
                              <span className="text-xs ml-1 text-muted-foreground">
                                ({preview.ai_analysis.sentiment_score.toFixed(2)})
                              </span>
                            </p>
                          </div>
                        )}

                      {/* Key Themes */}
                      {preview.ai_analysis.key_themes &&
                        preview.ai_analysis.key_themes.length > 0 && (
                          <div className="bg-card border rounded-lg p-3">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Key Themes
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {preview.ai_analysis.key_themes.map((theme: string, i: number) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] rounded-full font-medium"
                                >
                                  {theme}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Summary */}
                      {preview.ai_analysis.summary && (
                        <div className="bg-card border rounded-lg p-3">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            AI Summary
                          </p>
                          <p className="text-xs mt-1 text-muted-foreground leading-relaxed">
                            {preview.ai_analysis.summary}
                          </p>
                        </div>
                      )}

                      {/* Contradictions */}
                      {preview.ai_analysis.contradictions &&
                        preview.ai_analysis.contradictions.length > 0 && (
                          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="text-destructive font-bold text-sm">⚠</span>
                              <p className="text-[10px] font-bold text-destructive uppercase tracking-wider">
                                Contradictions ({preview.ai_analysis.contradictions.length})
                              </p>
                            </div>
                            <div className="space-y-2">
                              {preview.ai_analysis.contradictions.map((c: any, i: number) => (
                                <div
                                  key={i}
                                  className="text-xs bg-background/50 rounded p-2 border border-destructive/10"
                                >
                                  <p className="font-medium">
                                    <span className="text-destructive">❝</span>
                                    {c.statement_a}
                                    <span className="text-destructive">❞</span>
                                  </p>
                                  <p className="text-muted-foreground my-1">vs.</p>
                                  <p className="font-medium">
                                    <span className="text-destructive">❝</span>
                                    {c.statement_b}
                                    <span className="text-destructive">❞</span>
                                  </p>
                                  <p className="text-muted-foreground mt-1 italic">
                                    {c.explanation}
                                  </p>
                                  {c.severity && (
                                    <span
                                      className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        c.severity === "high" || c.severity === "critical"
                                          ? "bg-destructive/10 text-destructive"
                                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                      }`}
                                    >
                                      {c.severity.toUpperCase()}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* No flags */}
                      {!preview.ai_analysis.contradictions?.length &&
                        !preview.ai_analysis.feasibility_score &&
                        !preview.ai_analysis.summary &&
                        !preview.ai_analysis.key_themes?.length &&
                        preview.ai_analysis.sentiment_score === null && (
                          <div className="bg-muted/30 border border-dashed rounded-lg p-4 text-center">
                            <p className="text-xs text-muted-foreground">
                              No AI analysis available yet.
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              AI analysis runs automatically on manifesto submission.
                            </p>
                          </div>
                        )}
                    </>
                  )}
                  {!preview.ai_analysis && (
                    <div className="bg-muted/30 border border-dashed rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground">No AI analysis available yet.</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        AI analysis runs automatically on manifesto submission.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectId} onOpenChange={(b) => !b && setRejectId(null)}>
        <DialogContent>
          <DialogTitle>Reject manifesto</DialogTitle>
          <p className="text-sm text-muted-foreground">
            The candidate will see your remarks and can revise and resubmit.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection..."
            className="w-full h-28 p-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setRejectId(null)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white"
              disabled={!reason.trim() || !!loadingId}
              onClick={handleRejectConfirm}
            >
              Confirm reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/admin/manifestos")({ component: Page });
