import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageLoader } from "@/components/PageLoader";
import { Lock, Copy, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { toast } from "sonner";
import { fetchCurrentElection, fetchElectionResults, publishResults } from "@/lib/api";
import { ReconfirmPasswordModal } from "@/components/ReconfirmPasswordModal";

function Page() {
  const [results, setResults] = useState<any[]>([]);
  const [published, setPublished] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [hash, setHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [reconfirmOpen, setReconfirmOpen] = useState(false);

  if (!published && !confirm) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Election Results</h1>
        </div>
        <div className="bg-card rounded-2xl shadow-sm p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 font-semibold">Results not yet published</p>
          <p className="text-sm text-muted-foreground mt-1">
            Voting must close before results can be computed.
          </p>
          <Button
            className="mt-6 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
            onClick={() => setConfirm(true)}
          >
            Publish Results
          </Button>
        </div>
      </div>
    );
  }

  if (!published) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-card rounded-2xl shadow-sm p-8 max-w-md text-center">
          <h2 className="text-lg font-semibold">Publish results?</h2>
          <p className="text-sm text-muted-foreground mt-2">
            This will notify all users and cannot be undone.
          </p>
          <div className="flex gap-2 mt-6 justify-center">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={loading}
              onClick={() => setReconfirmOpen(true)}
            >
              {loading ? "Publishing..." : "Confirm Publish"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!results.length) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-[28px] font-bold">Election Results</h1>
        <Button variant="outline" onClick={() => toast.success("PDF exported")}>
          <FileDown className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
      </div>

      {results.map((r) => (
        <div key={r.position} className="bg-card rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-semibold mb-4">{r.position}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={r.candidates}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip />
              <Bar dataKey="votes" fill="#1F3A6E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}

      <div className="bg-muted/40 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">SHA-256 Integrity Hash</p>
          <p className="font-mono text-xs break-all">{hash}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(hash);
            toast.success("Hash copied");
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1" />
          Copy
        </Button>
      </div>
      {/* Password Reconfirmation Modal */}
      <ReconfirmPasswordModal
        open={reconfirmOpen}
        onOpenChange={setReconfirmOpen}
        title="Publish Results"
        description="Publishing results is a sensitive action. Please confirm your password to proceed."
        actionLabel="Confirm Publish"
        onVerified={async () => {
          setLoading(true);
          try {
            const election = await fetchCurrentElection();
            await publishResults(election.election_id);
            const data = await fetchElectionResults(election.election_id);
            setResults(data.results ?? []);
            setHash(data.integrity_hash ?? "");
            setPublished(true);
            setConfirm(false);
            toast.success("Results published");
          } catch (e: any) {
            toast.error(e?.message || "Failed to publish results");
          } finally {
            setLoading(false);
          }
        }}
      />
    </div>
  );
}

export const Route = createFileRoute("/admin/results")({ component: Page });
