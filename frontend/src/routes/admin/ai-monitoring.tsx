import { createFileRoute } from "@tanstack/react-router";
import { PageLoader } from "@/components/PageLoader";
import { useAiAlerts, useHourlyVotes } from "@/hooks/use-election-data";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { resolveAiAlert, verifyLedger, fetchIpClusters, clusterConcerns } from "@/lib/api";
import { toast } from "sonner";

function Page() {
  const queryClient = useQueryClient();
  const { data: hourlyVotes = [], isPending: loadingVotes } = useHourlyVotes();
  const { data: alerts = [], isPending: loadingAlerts, refetch: refetchAlerts } = useAiAlerts();
  const { data: ipData, isPending: loadingIps } = useQuery({
    queryKey: ["admin-ip-clusters"],
    queryFn: fetchIpClusters,
    refetchInterval: 30_000,
  });

  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [clustering, setClustering] = useState(false);

  const handleResolveAlert = async (alertId: string) => {
    try {
      await resolveAiAlert(alertId);
      refetchAlerts();
    } catch (e) {
      console.error("Failed to resolve alert", e);
    }
  };

  const handleVerifyLedger = async () => {
    setVerifying(true);
    setVerificationResult(null);
    try {
      const res = await verifyLedger();
      setVerificationResult(res);
    } catch (e) {
      console.error("Failed to verify ledger", e);
      setVerificationResult({
        valid: false,
        error: true,
        message: e instanceof Error ? e.message : "Ledger verification failed",
      });
    } finally {
      setVerifying(false);
    }
  };

  if (loadingVotes || loadingAlerts) return <PageLoader />;

  const unresolvedAlerts = alerts.filter((a: any) => !a.is_resolved);
  const resolvedAlerts = alerts.filter((a: any) => a.is_resolved);
  const predict = hourlyVotes.map((h) => ({ ...h, predicted: Math.round(h.baseline * 1.05) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">AI Monitoring & Auditing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time vote chain auditing, fraud detection, and forensics.
          </p>
        </div>
      </div>

      {/* Ledger Integrity Verification Control Panel */}
      <div className="bg-card rounded-2xl shadow-sm p-6 border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold">Ledger Integrity Verification</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cryptographically verify database vote chain continuity against the secure ledger
              vault.
            </p>
          </div>
          <Button
            onClick={handleVerifyLedger}
            disabled={verifying}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium px-5 py-2.5 rounded-xl transition-all shadow-sm"
          >
            {verifying ? "Verifying chain..." : "Verify Ledger"}
          </Button>
        </div>

        {verificationResult && (
          <div className="mt-4 p-4 rounded-xl border bg-muted/30 space-y-4">
            <div className="flex items-center gap-3">
              {verificationResult.valid ? (
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 font-bold shrink-0">
                  ✓
                </div>
              ) : (
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/10 text-destructive font-bold shrink-0">
                  ✗
                </div>
              )}
              <div>
                <p className="font-semibold text-sm">
                  {verificationResult.valid ? "Chain Valid ✓" : "Tampering Detected ✗"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {verificationResult.valid
                    ? "All cryptographic links, sequences, and vault hashes match perfectly."
                    : "Cryptographic validation failed. Discrepancies found."}
                </p>
              </div>
            </div>

            {verificationResult.error && (
              <p className="text-sm text-destructive font-mono bg-destructive/5 p-2.5 rounded">
                Error: {verificationResult.message}
              </p>
            )}

            {/* Tampered Entries */}
            {verificationResult.tampered_entries &&
              verificationResult.tampered_entries.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-destructive uppercase tracking-wider">
                    Tampered Entries ({verificationResult.tampered_entries.length})
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-xs border rounded bg-background p-2">
                    {verificationResult.tampered_entries.map((e: any, idx: number) => (
                      <div key={idx} className="p-1 border-b last:border-0 text-destructive">
                        Sequence #{e.sequence} (Vote ID: {e.vote_id?.slice(0, 8)}...): {e.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Missing Entries */}
            {verificationResult.missing_entries &&
              verificationResult.missing_entries.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                    Missing Entries (Deleted Votes) ({verificationResult.missing_entries.length})
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-xs border rounded bg-background p-2">
                    {verificationResult.missing_entries.map((e: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-1 border-b last:border-0 text-amber-600 dark:text-amber-400"
                      >
                        Sequence #{e.sequence} (Vault Hash: {e.hash?.slice(0, 12)}...): {e.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Hash Mismatches */}
            {verificationResult.hash_mismatches &&
              verificationResult.hash_mismatches.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-destructive uppercase tracking-wider">
                    Hash Mismatches ({verificationResult.hash_mismatches.length})
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-xs border rounded bg-background p-2">
                    {verificationResult.hash_mismatches.map((e: any, idx: number) => (
                      <div key={idx} className="p-1 border-b last:border-0 text-destructive">
                        Sequence #{e.sequence} (Vote ID: {e.vote_id?.slice(0, 8)}...): Stored hash
                        does not match recalculated hash.
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5 border">
        <h2 className="text-base font-semibold mb-4">Vote Velocity</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={hourlyVotes}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="hour" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip />
            <Legend />
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" label="Baseline" />
            <Line
              type="monotone"
              dataKey="votes"
              stroke="#6C63FF"
              strokeWidth={2.5}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl shadow-sm p-5 border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">IP Clustering Analysis</h2>
            <span className="text-xs text-muted-foreground">
              {ipData ? `${ipData.total_unique_ips} unique IPs` : ""}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left p-2">Subnet</th>
                <th className="text-left p-2">Sessions</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingIps ? (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : !ipData || ipData.clusters.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-muted-foreground">
                    No IP data yet. Activity will appear here once users interact with the system.
                  </td>
                </tr>
              ) : (
                ipData.clusters.map((r) => (
                  <tr key={r.subnet} className={r.flagged ? "bg-destructive/5" : ""}>
                    <td className="p-2 font-mono text-xs">{r.subnet}</td>
                    <td className="p-2">{r.sessions}</td>
                    <td className="p-2">
                      {r.flagged ? (
                        <Badge className="bg-destructive text-white">Flagged</Badge>
                      ) : (
                        <Badge variant="outline">Normal</Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-card rounded-2xl shadow-sm p-5 border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Behavioral & Honeypot Alerts</h2>
            <Button
              size="sm"
              variant="outline"
              disabled={clustering}
              onClick={async () => {
                setClustering(true);
                try {
                  const res = await clusterConcerns();
                  toast.success(`Clustered ${res.clustered} concerns into ${res.groups} groups`);
                  queryClient.invalidateQueries({ queryKey: ["admin-concerns"] });
                } catch (e: any) {
                  toast.error(e?.message || "Clustering failed");
                } finally {
                  setClustering(false);
                }
              }}
            >
              {clustering ? "Clustering..." : "Cluster Concerns"}
            </Button>
          </div>
          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {unresolvedAlerts.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
                No active alerts detected ✓
              </div>
            )}
            {unresolvedAlerts.map((a: any) => (
              <div
                key={a.alert_id}
                className="flex items-start justify-between p-3 bg-muted/40 rounded-lg gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {a.alert_type}
                    </Badge>
                    {a.confidence_score !== undefined && (
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                        {(a.confidence_score * 100).toFixed(0)}% Conf
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-1.5 break-words">{a.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    IP: {a.ip_address || "unknown"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    className={
                      a.severity === "HIGH" || a.severity === "CRITICAL"
                        ? "bg-destructive text-white"
                        : "bg-warning text-warning-foreground"
                    }
                  >
                    {a.severity}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleResolveAlert(a.alert_id)}
                  >
                    Resolve
                  </Button>
                </div>
              </div>
            ))}

            {/* Show recently resolved alerts */}
            {resolvedAlerts.length > 0 && (
              <div className="mt-4 pt-4 border-t space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Recently Resolved
                </p>
                {resolvedAlerts.slice(0, 5).map((a: any) => (
                  <div
                    key={a.alert_id}
                    className="flex items-center justify-between p-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-xs opacity-75"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-emerald-700 dark:text-emerald-400 truncate">
                        {a.description}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Resolved by: {a.resolved_by || "admin"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-emerald-600 border-emerald-600/20 shrink-0"
                    >
                      Resolved ✓
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5 border">
        <h2 className="text-base font-semibold mb-4">Turnout: Predicted vs Actual</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={predict}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="hour" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="#cbd5e1"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="votes"
              stroke="#1F3A6E"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/ai-monitoring")({ component: Page });
