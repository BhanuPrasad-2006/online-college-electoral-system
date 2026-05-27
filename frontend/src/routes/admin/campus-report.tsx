import { createFileRoute } from "@tanstack/react-router";
import { PageLoader } from "@/components/PageLoader";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCampusReport } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";
import {
  FileText,
  Printer,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  Layers,
  BarChart3,
  Lightbulb,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";

const CATEGORY_BAR_COLORS: Record<string, string> = {
  academic: "bg-blue-500",
  infrastructure: "bg-amber-500",
  campus_life: "bg-emerald-500",
  administration: "bg-purple-500",
  other: "bg-gray-400",
  unknown: "bg-muted-foreground/30",
};

const CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic",
  infrastructure: "Infrastructure",
  campus_life: "Campus Life",
  administration: "Administration",
  other: "Other",
};

const SENTIMENT_EMOJIS: Record<string, string> = {
  positive: "\uD83D\uDFE2",
  neutral: "\uD83D\uDD35",
  negative: "\uD83D\uDD34",
};

function formatDate(iso: string | null) {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Page() {
  const queryClient = useQueryClient();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ["admin-campus-report"],
    queryFn: fetchCampusReport,
    refetchInterval: 120_000,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["admin-campus-report"] });
    setIsRefreshing(false);
  };

  const handlePrint = () => {
    window.print();
  };

  if (isPending) return <PageLoader />;

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive/60" />
        <h2 className="text-lg font-semibold">Failed to load campus report</h2>
        <p className="text-sm text-muted-foreground">
          The report could not be generated. Please try again.
        </p>
        <Button onClick={handleRefresh} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const totalPos = data.sentiment_summary?.positive ?? 0;
  const totalNeg = data.sentiment_summary?.negative ?? 0;
  const totalNeu = data.sentiment_summary?.neutral ?? 0;
  const totalSentiment = totalPos + totalNeg + totalNeu;
  const dominantSentiment =
    totalPos > totalNeg ? "positive" : totalNeg > totalPos ? "negative" : "neutral";

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Toolbar — hidden in print */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">State of the Campus</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregated concern analysis and AI-generated executive report
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Print / PDF
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div ref={reportRef} className="space-y-6 print:space-y-4">
        {/* Report Header */}
        <div className="bg-gradient-to-br from-[#1F3A6E] to-[#6C63FF] rounded-2xl p-6 md:p-8 text-white shadow-lg print:bg-white print:text-black print:border-2 print:border-gray-300 print:rounded-none">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-white/80 print:text-gray-600" />
                <span className="text-xs font-semibold uppercase tracking-widest text-white/70 print:text-gray-500">
                  CollegeVote Report
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold">State of the Campus Report</h2>
              <p className="text-sm text-white/70 mt-1 print:text-gray-600">
                Generated {formatDateTime(data.generated_at)}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-semibold border-white/30 print:border-gray-400 print:text-gray-700",
                "bg-white/10 print:bg-transparent",
              )}
            >
              v1.0
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white/10 rounded-xl p-3 print:bg-gray-100 print:text-gray-800">
              <p className="text-2xl font-bold">{data.total_concerns}</p>
              <p className="text-[10px] text-white/70 print:text-gray-500 uppercase tracking-wider">
                Total Concerns
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 print:bg-gray-100 print:text-gray-800">
              <p className="text-2xl font-bold">{data.total_clusters}</p>
              <p className="text-[10px] text-white/70 print:text-gray-500 uppercase tracking-wider">
                Issue Clusters
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 print:bg-gray-100 print:text-gray-800">
              <p className="text-2xl font-bold">{Object.keys(data.category_distribution).length}</p>
              <p className="text-[10px] text-white/70 print:text-gray-500 uppercase tracking-wider">
                Categories
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 print:bg-gray-100 print:text-gray-800">
              <p className="text-2xl font-bold capitalize">{dominantSentiment}</p>
              <p className="text-[10px] text-white/70 print:text-gray-500 uppercase tracking-wider">
                Overall Mood
              </p>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <Card className="bg-card border-border/60 shadow-sm print:shadow-none print:border">
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#6C63FF]" />
              <CardTitle className="text-base">Executive Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-2">
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
              {data.executive_summary}
            </p>
          </CardContent>
        </Card>

        {/* Key Findings */}
        <Card className="bg-card border-border/60 shadow-sm print:shadow-none print:border">
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base">Key Findings</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-2">
            <ul className="space-y-2">
              {data.key_findings?.map((finding, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="h-5 w-5 rounded-full bg-[#6C63FF]/10 text-[#6C63FF] flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <span className="text-foreground/85">{finding}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Analytics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:gap-4">
          {/* Category Distribution */}
          <Card className="bg-card border-border/60 shadow-sm print:shadow-none print:border">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-500" />
                <CardTitle className="text-sm font-semibold">Category Distribution</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              {Object.entries(data.category_distribution).map(([cat, count]) => {
                const pct = (count / data.total_concerns) * 100;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground/80">
                        {CATEGORY_LABELS[cat] ?? cat}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${CATEGORY_BAR_COLORS[cat] ?? "bg-muted-foreground/30"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Sentiment Breakdown */}
          <Card className="bg-card border-border/60 shadow-sm print:shadow-none print:border">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <CardTitle className="text-sm font-semibold">Sentiment Breakdown</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4">
              {(["positive", "neutral", "negative"] as const).map((sent) => {
                const count = data.sentiment_summary?.[sent] ?? 0;
                const pct = totalSentiment > 0 ? (count / totalSentiment) * 100 : 0;
                const colorMap = {
                  positive: "bg-emerald-500",
                  neutral: "bg-blue-500",
                  negative: "bg-destructive",
                };
                return (
                  <div key={sent}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                        <span className="text-sm">{SENTIMENT_EMOJIS[sent]}</span>
                        <span className="capitalize">{sent}</span>
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${colorMap[sent]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="mt-4 pt-3 border-t border-border/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Average Priority</span>
                  <span className="font-semibold">{data.avg_priority}/5</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1.5">
                  <span className="text-muted-foreground">Report Period</span>
                  <span className="font-semibold">
                    {formatDate(data.date_range?.earliest)} — {formatDate(data.date_range?.latest)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trend Analysis */}
        <Card className="bg-card border-border/60 shadow-sm print:shadow-none print:border">
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Trend Analysis</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-2">
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
              {data.trend_analysis}
            </p>
          </CardContent>
        </Card>

        {/* Top Concern Clusters */}
        <Card className="bg-card border-border/60 shadow-sm print:shadow-none print:border">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#6C63FF]" />
                <CardTitle className="text-base">Top Issue Clusters</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                {data.top_clusters?.length ?? 0} of {data.total_clusters} shown
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-3">
            {data.top_clusters?.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
                No clusters identified yet. Use "Cluster Concerns" from AI Monitoring to group
                issues.
              </div>
            ) : (
              data.top_clusters?.map((cluster, i) => (
                <div
                  key={cluster.cluster_id ?? `unclustered-${i}`}
                  className={cn(
                    "p-4 rounded-xl border transition-colors",
                    cluster.is_unclustered
                      ? "bg-amber-500/5 border-amber-200/30 dark:border-amber-800/30"
                      : "bg-muted/20 border-border/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-bold tabular-nums text-[#6C63FF]">
                        {cluster.size}
                      </span>
                      <span className="text-xs text-muted-foreground">concerns</span>
                      {!cluster.is_unclustered && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono",
                            CATEGORY_BAR_COLORS[cluster.category]?.replace("bg-", "bg-") ??
                              "bg-muted text-muted-foreground",
                          )}
                        >
                          {CATEGORY_LABELS[cluster.category] ?? cluster.category}
                        </Badge>
                      )}
                      {cluster.is_unclustered && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-200"
                        >
                          Unclustered
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {cluster.representative_texts?.map((text, ti) => (
                      <p
                        key={ti}
                        className="text-xs text-muted-foreground line-clamp-1 pl-2 border-l-2 border-border"
                      >
                        {text}
                      </p>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Suggested Actions */}
        <Card className="bg-card border-border/60 shadow-sm print:shadow-none print:border">
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Suggested Actions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.suggested_actions?.map((action, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/40"
                >
                  <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm text-foreground/85">{action}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-4 text-[10px] text-muted-foreground print:block hidden">
          <p>CollegeVote — State of the Campus Report</p>
          <p>Generated {formatDateTime(data.generated_at)}</p>
          <p>This is a computer-generated report. Data sourced from student concern submissions.</p>
        </div>

        {/* Regenerate button — hidden in print */}
        <div className="flex justify-center print:hidden">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            {isRefreshing ? "Regenerating..." : "Regenerate Report"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/campus-report")({ component: Page });
