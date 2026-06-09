import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/PageLoader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  X,
  Eye,
  Calendar,
  Clock,
  User,
  Globe,
  FileText,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";

import { fetchAuditLogs, type AuditLogEntry, type AuditLogResponse } from "@/lib/api";

// ── Severity helpers ──────────────────────────────────────────
const LEVEL_STYLES: Record<string, { badge: string; icon: React.ReactNode; label: string }> = {
  success: {
    badge: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    label: "Success",
  },
  warning: {
    badge: "bg-amber-500/10 text-amber-600 border-amber-200",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    label: "Warning",
  },
  security: {
    badge: "bg-red-500/10 text-red-600 border-red-200",
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    label: "Security",
  },
};

function getEventCategory(event: string = "", desc: string = ""): string {
  const ev = (event || "").toUpperCase();
  const de = (desc || "").toUpperCase();

  // AI
  if (ev.includes("AI") || de.includes("/AI/") || de.includes("AI_SERVICE") || ev.includes("CLUSTERING")) {
    return "AI";
  }
  // SECURITY
  if (ev.includes("FAILED") || ev.includes("ERROR") || ev.includes("ALERT") || ev.includes("HONEYPOT") || ev.includes("SUSPICIOUS") || ev.includes("SECURITY")) {
    return "SECURITY";
  }
  // OTP
  if (ev.includes("OTP") || de.includes("/OTP") || de.includes("OTP")) {
    return "OTP";
  }
  // LOGIN/AUTH
  if (ev.includes("LOGIN") || ev.includes("LOGOUT") || de.includes("/AUTH/")) {
    return "LOGIN";
  }
  // VOTE
  if (ev.includes("VOTE") || de.includes("/VOTE/")) {
    return "VOTE";
  }
  // CANDIDATE
  if (ev.includes("CANDIDATE") || de.includes("/CANDIDATES/")) {
    return "CANDIDATE";
  }
  // PARTY
  if (ev.includes("PARTY") || ev.includes("PARTIES") || de.includes("/PARTIES/")) {
    return "PARTY";
  }
  // RESULTS
  if (ev.includes("RESULTS") || ev.includes("TALLY") || de.includes("/RESULTS") || de.includes("PUBLISH-RESULTS")) {
    return "RESULTS";
  }
  // ELECTION
  if (ev.includes("ELECTION") || de.includes("/ELECTION")) {
    return "ELECTION";
  }
  // ADMIN
  if (ev.includes("ADMIN") || de.includes("/ADMIN/")) {
    return "ADMIN";
  }

  return "OTHER";
}

const EVENT_CATEGORIES = ["ALL", "LOGIN", "OTP", "VOTE", "ADMIN", "CANDIDATE", "PARTY", "ELECTION", "SECURITY", "RESULTS", "AI", "OTHER"];

// ── Severity Dot ──────────────────────────────────────────────
function SeverityDot({ level }: { level: string }) {
  const colors: Record<string, string> = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    security: "bg-red-500",
  };
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        colors[level] ?? "bg-gray-400",
      )}
    />
  );
}

// ── Detail Modal ──────────────────────────────────────────────
function LogDetailModal({
  log,
  onClose,
}: {
  log: AuditLogEntry | null;
  onClose: () => void;
}) {
  if (!log) return null;

  const style = LEVEL_STYLES[log.level] ?? LEVEL_STYLES.success;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl border max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", log.level === "security" ? "bg-red-100" : log.level === "warning" ? "bg-amber-100" : "bg-emerald-100")}>
              {log.level === "security" ? (
                <ShieldAlert className="h-5 w-5 text-red-600" />
              ) : log.level === "warning" ? (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold">{log.event}</h3>
              <Badge variant="outline" className={cn("mt-0.5 text-xs font-mono", style.badge)}>
                {style.icon}
                <span className="ml-1">{style.label}</span>
              </Badge>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium">Timestamp</p>
              <p className="text-sm font-mono">{log.ts ?? "N/A"}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium">Actor</p>
              <p className="text-sm font-mono">{log.actor}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
            <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium">IP Address</p>
              <p className="text-sm font-mono">{log.ip}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
            <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium">Description</p>
              <p className="text-sm whitespace-pre-wrap">{log.desc ?? "No description"}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5 pt-4 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────
function downloadCsv(logs: AuditLogEntry[]) {
  const headers = ["Timestamp", "Event", "Actor", "IP", "Level", "Description"];
  const rows = logs.map((l) =>
    [
      l.ts ?? "",
      l.event,
      l.actor,
      l.ip,
      l.level,
      (l.desc ?? "").replace(/"/g, '""'),
    ]
      .map((v) => `"${v}"`)
      .join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page ─────────────────────────────────────────────────
function Page() {
  const queryClient = useQueryClient();
  const [searchVal, setSearchVal] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("ALL");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const PAGE_SIZE = 25;

  // Build query params (server-side: search, date range; no event_type — category is client-side)
  const queryParams: Record<string, any> = {
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  };
  if (q) queryParams.q = q;
  if (dateFrom) queryParams.date_from = dateFrom;
  if (dateTo) queryParams.date_to = dateTo;
  if (actorFilter) queryParams.actor = actorFilter;

  const { data, isPending, isFetching } = useQuery({
    queryKey: ["audit-logs", queryParams, autoRefresh],
    queryFn: () => fetchAuditLogs(queryParams),
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const allLogs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Client-side filter by event category
  const logs = allLogs.filter((l) => {
    if (category === "ALL") return true;
    return getEventCategory(l.event, l.desc ?? "") === category;
  });

  const handleSearchCommit = () => {
    setQ(searchVal);
    setPage(0);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
  };

  if (isPending && !data) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Audit Trail Viewer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Forensic audit log of all system actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="text-xs gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", autoRefresh && "animate-spin")} />
            Auto
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="text-xs gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(allLogs)}
            disabled={logs.length === 0}
            className="text-xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* ── Stat Cards ──────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
              <Activity className="h-3 w-3" /> Total Events
            </p>
            <p className="text-2xl font-bold mt-1">{total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Success
            </p>
            <p className="text-2xl font-bold mt-1">
              {logs.filter((l) => l.level === "success").length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-800">
          <CardContent className="p-4">
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Warnings
            </p>
            <p className="text-2xl font-bold mt-1">
              {logs.filter((l) => l.level === "warning").length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> Security
            </p>
            <p className="text-2xl font-bold mt-1">
              {logs.filter((l) => l.level === "security").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchCommit()}
              placeholder="Search descriptions..."
              className="pl-9"
            />
          </div>
          <Button
            onClick={handleSearchCommit}
            className="bg-[#0F8A5F] hover:bg-[#0F8A5F]/90 text-white"
          >
            Search
          </Button>
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(0);
          }}
          className="w-full sm:w-40 text-xs"
          title="From date"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(0);
          }}
          className="w-full sm:w-40 text-xs"
          title="To date"
        />
        <Input
          value={actorFilter}
          onChange={(e) => {
            setActorFilter(e.target.value);
            setPage(0);
          }}
          placeholder="Filter by Actor email..."
          className="w-full sm:w-48 text-xs"
          title="Actor / User"
        />
      </div>

      {/* ── Category filter pills ────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {EVENT_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setCategory(cat);
              setPage(0);
            }}
            className={cn(
              "px-3 py-1.5 text-xs rounded-lg font-medium whitespace-nowrap transition-colors",
              category === cat
                ? "bg-[#0F8A5F] text-white shadow-sm"
                : "bg-muted hover:bg-muted/80 text-muted-foreground",
            )}
          >
            {cat === "SECURITY" ? (
              <span className="flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" /> Security
              </span>
            ) : (
              cat
            )}
          </button>
        ))}
      </div>

      {/* ── Event count ─────────────────────────── */}
      <p className="text-xs text-muted-foreground">
        Showing {logs.length} of {total.toLocaleString()} total events
        {isFetching && (
          <span className="inline-block ml-2">
            <RefreshCw className="h-3 w-3 animate-spin inline" />
          </span>
        )}
      </p>

      {/* ── Table ────────────────────────────────── */}
      <div className="bg-card rounded-2xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="text-xs text-muted-foreground border-b text-left">
              <th className="p-3 w-1" />
              <th className="p-3">Timestamp</th>
              <th className="p-3">Event</th>
              <th className="p-3">Actor</th>
              <th className="p-3">IP</th>
              <th className="p-3">Description</th>
              <th className="p-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No audit logs match your filters.</p>
                  <button
                    onClick={() => {
                      setQ("");
                      setCategory("ALL");
                      setDateFrom("");
                      setDateTo("");
                      setPage(0);
                    }}
                    className="text-xs text-[#0F8A5F] hover:underline mt-1"
                  >
                    Clear all filters
                  </button>
                </td>
              </tr>
            ) : (
              logs.map((l: AuditLogEntry) => {
                const style = LEVEL_STYLES[l.level] ?? LEVEL_STYLES.success;
                return (
                  <tr
                    key={l.id}
                    className={cn(
                      "border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer",
                      l.level === "security" && "bg-red-500/5",
                      l.level === "warning" && "bg-amber-500/5",
                    )}
                    onClick={() => setSelectedLog(l)}
                  >
                    <td className="p-3">
                      <SeverityDot level={l.level} />
                    </td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{l.ts}</td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={cn("text-xs font-mono", style.badge)}
                      >
                        {style.icon}
                        <span className="ml-1">{l.event}</span>
                      </Badge>
                    </td>
                    <td className="p-3 text-xs font-mono max-w-[120px] truncate">
                      {l.actor === "anonymous" ? (
                        <span className="text-muted-foreground italic">anonymous</span>
                      ) : (
                        l.actor
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">{l.ip}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[300px] truncate">
                      {l.desc ?? "—"}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(l);
                        }}
                        className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
                        title="View details"
                      >
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page + 1} of {totalPages}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            Previous
          </Button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const startPage = Math.max(0, Math.min(page - 2, totalPages - 5));
            const p = startPage + i;
            if (p >= totalPages) return null;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  "h-8 w-8 rounded-lg text-xs font-medium transition-colors",
                  p === page
                    ? "bg-[#0F8A5F] text-white"
                    : "hover:bg-muted text-muted-foreground",
                )}
              >
                {p + 1}
              </button>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="text-xs"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>

      {/* ── Detail Modal ─────────────────────────── */}
      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}

export const Route = createFileRoute("/admin/audit-logs")({ component: Page });
