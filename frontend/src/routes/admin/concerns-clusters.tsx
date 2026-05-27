import { createFileRoute, Link } from "@tanstack/react-router";
import { PageLoader } from "@/components/PageLoader";
import { useQuery } from "@tanstack/react-query";
import { fetchClusteredConcerns } from "@/lib/api";
import { useCandidates } from "@/hooks/use-election-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Layers,
  MessageSquare,
  TrendingUp,
  BarChart3,
  Search,
  ArrowUpRight,
  ChevronRight,
  Clock,
  AlertCircle,
} from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  academic: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  infrastructure:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  campus_life:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  administration:
    "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  other: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800",
  unknown: "bg-muted text-muted-foreground border-border",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  neutral: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  negative: "bg-destructive/10 text-destructive",
};

const CATEGORY_BAR_COLORS: Record<string, string> = {
  academic: "bg-blue-500",
  infrastructure: "bg-amber-500",
  campus_life: "bg-emerald-500",
  administration: "bg-purple-500",
  other: "bg-gray-400",
  unknown: "bg-muted-foreground/30",
};

function sentimentLabel(s: string) {
  switch (s) {
    case "positive":
      return "Positive";
    case "negative":
      return "Negative";
    default:
      return "Neutral";
  }
}

function formatCategory(cat: string) {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ConcernItem = {
  concern_id: string;
  content: string;
  category: string;
  sentiment: string;
  priority: number;
  submitted_at: string | null;
  to_candidate_id?: string | null;
};

type Cluster = {
  cluster_id: string | null;
  is_unclustered: boolean;
  size: number;
  representative_texts: string[];
  category_distribution: Record<string, number>;
  sentiment_breakdown: { positive: number; neutral: number; negative: number };
  concerns: ConcernItem[];
};

function Page() {
  const { data, isPending } = useQuery({
    queryKey: ["admin-clustered-concerns"],
    queryFn: fetchClusteredConcerns,
    refetchInterval: 60_000,
  });

  const { data: candidates = [] } = useCandidates();

  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  if (isPending) return <PageLoader />;

  const clusters: Cluster[] = data?.clusters ?? [];
  const totalConcerns = data?.total_concerns ?? 0;
  const totalClusters = data?.total_clusters ?? 0;
  const unclusteredCount = data?.unclustered_count ?? 0;

  const filteredClusters = searchQuery
    ? clusters.filter(
        (c) =>
          c.representative_texts.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
          Object.keys(c.category_distribution).some((cat) =>
            cat.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
      )
    : clusters;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Clustered Concerns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Student concerns grouped by semantic similarity — detect duplicate reports and trending
            issues at a glance.
          </p>
        </div>
        <Link to="/admin/ai-monitoring">
          <Button variant="outline" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            AI Monitoring
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border/60 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-[#6C63FF]/10 flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5 text-[#6C63FF]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalConcerns}</p>
              <p className="text-xs text-muted-foreground">Total Concerns</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/60 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalClusters}</p>
              <p className="text-xs text-muted-foreground">Clusters</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/60 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {totalConcerns > 0
                  ? (((totalConcerns - unclusteredCount) / totalConcerns) * 100).toFixed(0)
                  : 0}
                %
              </p>
              <p className="text-xs text-muted-foreground">Clustered</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/60 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{unclusteredCount}</p>
              <p className="text-xs text-muted-foreground">Unclustered</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search clusters by keyword or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30 focus:border-[#6C63FF]/50 transition-all"
        />
      </div>

      {/* Cluster List */}
      {filteredClusters.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl bg-card/50">
          <Layers className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground">No clusters yet</h3>
          <p className="text-sm text-muted-foreground/60 mt-1 max-w-md mx-auto">
            {searchQuery
              ? "No clusters match your search. Try different keywords."
              : 'Concerns will appear here once students submit them. Use the "Cluster Concerns" button in AI Monitoring to group them.'}
          </p>
          {!searchQuery && (
            <Link to="/admin/ai-monitoring">
              <Button variant="outline" className="mt-4 gap-2">
                Go to AI Monitoring
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredClusters.map((cluster) => {
            const topCategory =
              Object.entries(cluster.category_distribution).sort((a, b) => b[1] - a[1])[0]?.[0] ??
              "unknown";
            const dominantSentiment =
              Object.entries(cluster.sentiment_breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ??
              "neutral";

            return (
              <Card
                key={cluster.cluster_id ?? "__unclustered__"}
                className={cn(
                  "bg-card border-border/60 shadow-sm cursor-pointer transition-all duration-200",
                  "hover:shadow-md hover:border-[#6C63FF]/30 hover:-translate-y-0.5",
                  cluster.is_unclustered && "opacity-70 hover:opacity-100",
                )}
                onClick={() => setSelectedCluster(cluster)}
              >
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-semibold text-xs",
                            cluster.is_unclustered
                              ? "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800"
                              : "bg-[#6C63FF]/10 text-[#6C63FF] border-[#6C63FF]/20",
                          )}
                        >
                          {cluster.is_unclustered ? "Unclustered" : "Cluster"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-[10px]",
                            CATEGORY_COLORS[topCategory] ?? CATEGORY_COLORS.unknown,
                          )}
                        >
                          {formatCategory(topCategory)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            SENTIMENT_COLORS[dominantSentiment] ?? SENTIMENT_COLORS.neutral,
                          )}
                        >
                          {sentimentLabel(dominantSentiment)}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg mt-3 flex items-center gap-2">
                        <span>{cluster.representative_texts[0]?.slice(0, 60) || "No content"}</span>
                        {cluster.representative_texts[0]?.length > 60 && "..."}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-2xl font-bold tabular-nums text-[#6C63FF]">
                        {cluster.size}
                      </span>
                      <span className="text-xs text-muted-foreground">concerns</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="space-y-1.5 mb-4">
                    {cluster.representative_texts.map((text, i) => (
                      <p
                        key={i}
                        className="text-xs text-muted-foreground line-clamp-1 pl-2 border-l-2 border-border"
                      >
                        {text}
                      </p>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Category Distribution
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {Object.keys(cluster.category_distribution).length} categories
                      </span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                      {Object.entries(cluster.category_distribution).map(([cat, count]) => {
                        const pct = (count / cluster.size) * 100;
                        return (
                          <div
                            key={cat}
                            className={cn(
                              "first:rounded-l-full last:rounded-r-full transition-all duration-300",
                              CATEGORY_BAR_COLORS[cat] ?? "bg-muted-foreground/30",
                            )}
                            style={{ width: `${pct}%` }}
                            title={`${formatCategory(cat)}: ${count} (${pct.toFixed(0)}%)`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(cluster.category_distribution)
                        .slice(0, 4)
                        .map(([cat, count]) => (
                          <span
                            key={cat}
                            className="text-[10px] text-muted-foreground flex items-center gap-1"
                          >
                            <span
                              className={cn(
                                "inline-block w-2 h-2 rounded-full",
                                CATEGORY_BAR_COLORS[cat] ?? "bg-muted-foreground/30",
                              )}
                            />
                            {formatCategory(cat)}: {count}
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {cluster.concerns.length} items
                    </div>
                    <span className="text-xs font-medium text-[#6C63FF] flex items-center gap-1">
                      View details <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cluster Detail Dialog */}
      <Dialog open={!!selectedCluster} onOpenChange={(o) => !o && setSelectedCluster(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedCluster && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-semibold text-xs",
                      selectedCluster.is_unclustered
                        ? "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800"
                        : "bg-[#6C63FF]/10 text-[#6C63FF] border-[#6C63FF]/20",
                    )}
                  >
                    {selectedCluster.is_unclustered
                      ? "Unclustered"
                      : `Cluster \u2022 ${selectedCluster.size} concerns`}
                  </Badge>
                </div>
                <DialogTitle className="text-xl">
                  {selectedCluster.representative_texts[0]?.slice(0, 80) || "No content"}
                  {selectedCluster.representative_texts[0]?.length > 80 && "..."}
                </DialogTitle>
                <DialogDescription>
                  All {selectedCluster.size} concerns grouped in this cluster
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-xl border">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Cluster ID
                  </p>
                  <p className="text-xs font-mono text-foreground/80">
                    {selectedCluster.cluster_id ?? "\u2014"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Size
                  </p>
                  <p className="text-lg font-bold">{selectedCluster.size} concerns</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Category Distribution
                  </p>
                  <div className="space-y-1">
                    {Object.entries(selectedCluster.category_distribution).map(([cat, count]) => (
                      <div key={cat} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24 truncate">
                          {formatCategory(cat)}
                        </span>
                        <Progress
                          value={(count / selectedCluster.size) * 100}
                          className="h-1.5 flex-1"
                        />
                        <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Sentiment Breakdown
                  </p>
                  <div className="space-y-1">
                    {(["positive", "negative", "neutral"] as const).map((sent) => {
                      const count = selectedCluster.sentiment_breakdown[sent];
                      if (!count) return null;
                      return (
                        <div key={sent} className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-block w-2 h-2 rounded-full",
                              sent === "positive"
                                ? "bg-emerald-500"
                                : sent === "negative"
                                  ? "bg-destructive"
                                  : "bg-blue-500",
                            )}
                          />
                          <span className="text-xs text-muted-foreground capitalize w-16">
                            {sent}
                          </span>
                          <Progress
                            value={(count / selectedCluster.size) * 100}
                            className="h-1.5 flex-1"
                          />
                          <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  All Concerns ({selectedCluster.concerns.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {selectedCluster.concerns.map((c) => (
                    <div
                      key={c.concern_id}
                      className="p-3 bg-muted/30 rounded-lg border border-border/40 space-y-1.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            CATEGORY_COLORS[c.category] ?? CATEGORY_COLORS.unknown,
                          )}
                        >
                          {formatCategory(c.category)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            SENTIMENT_COLORS[c.sentiment] ?? SENTIMENT_COLORS.neutral,
                          )}
                        >
                          {sentimentLabel(c.sentiment)}
                        </Badge>
                        {c.to_candidate_id && (
                          <Badge variant="secondary" className="text-[9px]">
                            To: {
                              c.to_candidate_id === "admin"
                                ? "Admin (General)"
                                : candidates.find((x: any) => (x.candidate_id || x.id) === c.to_candidate_id)?.full_name || c.to_candidate_id
                            }
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                          P{c.priority}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed">{c.content}</p>
                      {c.submitted_at && (
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(c.submitted_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/admin/concerns-clusters")({ component: Page });
