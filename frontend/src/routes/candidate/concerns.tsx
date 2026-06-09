import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCandidateConcernsInbox, resolveApiAssetUrl } from "@/lib/api";
import { PageLoader } from "@/components/PageLoader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, MessageSquare, AlertTriangle, Smile, Meh, Frown, ArrowUpDown } from "lucide-react";

function Page() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const { data, isPending } = useQuery({
    queryKey: ["candidate-concerns-inbox", page],
    queryFn: () => fetchCandidateConcernsInbox({ page, page_size: 20 }),
  });

  if (isPending) return <PageLoader />;

  let concerns = data?.concerns || [];
  const total = data?.total || 0;

  // Filter by search
  if (q.trim()) {
    const lq = q.toLowerCase();
    concerns = concerns.filter(
      (c: any) =>
        (c.content || "").toLowerCase().includes(lq) ||
        (c.category || "").toLowerCase().includes(lq),
    );
  }

  // Sort
  concerns = [...concerns].sort((a: any, b: any) => {
    const da = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
    const db = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
    return sortOrder === "newest" ? db - da : da - db;
  });

  const totalPages = Math.ceil(total / 20);
  const sentimentIcon = (s: string) => {
    switch (s?.toLowerCase()) {
      case "positive": return <Smile className="h-4 w-4 text-success" />;
      case "negative": return <Frown className="h-4 w-4 text-destructive" />;
      default: return <Meh className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Student Concerns</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Anonymous student feedback and concerns. Personal voter information (name, email, student ID) is excluded for privacy.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search concerns by keyword..."
            className="pl-9"
          />
        </div>
        <button
          onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortOrder === "newest" ? "Newest First" : "Oldest First"}
        </button>
      </div>

      <div className="space-y-3">
        {concerns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">No concerns yet</h3>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Student concerns will appear here once submitted.
            </p>
          </div>
        ) : (
          concerns.map((c: any) => (
            <div key={c.concern_id} className="bg-card rounded-xl border border-border/60 p-4 space-y-2 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm whitespace-pre-wrap break-words">{c.content}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {c.category || "other"}
                </Badge>
                {c.priority && (
                  <span className={
                    c.priority >= 4
                      ? "text-destructive font-semibold"
                      : c.priority >= 3
                        ? "text-warning-foreground font-medium"
                        : "text-muted-foreground"
                  }>
                    Priority: {c.priority}/5
                  </span>
                )}
                <span className="flex items-center gap-1 text-muted-foreground">
                  {sentimentIcon(c.sentiment)}
                  <span className="capitalize">{c.sentiment}</span>
                </span>
                {c.attachment_url && (
                  <a
                    href={resolveApiAssetUrl(c.attachment_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0F8A5F] hover:underline font-medium"
                  >
                    📎 Attachment
                  </a>
                )}
                <span className="text-muted-foreground ml-auto">
                  {c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : "—"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-3 py-2 text-sm rounded-lg bg-muted hover:bg-muted/80 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground px-2">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-3 py-2 text-sm rounded-lg bg-muted hover:bg-muted/80 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/candidate/concerns")({ component: Page });
