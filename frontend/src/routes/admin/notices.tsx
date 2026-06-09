import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { fetchNotices, createNotice, resolveApiAssetUrl } from "@/lib/api";
import { toast } from "sonner";
import { Megaphone, FileText, Download, Calendar, User, Eye, AlertCircle, FileCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const NOTICE_TEMPLATES = [
  {
    label: "Election Schedule & Deadlines",
    title: "Official Election Schedule & Deadlines Announcement",
    content: `Dear Students,

Please find the official schedule and key deadlines for the upcoming student council election:

1. Nomination Open: June 1, 2026
2. Nomination Deadline: June 10, 2026
3. Verification Window: June 11-12, 2026
4. Voting Day: June 15, 2026 (09:00 - 17:00 IST)

Ensure you check your biometric registration status before voting day.`,
    priority: "HIGH",
    roleTarget: "ALL",
  },
  {
    label: "Nomination Window Extension",
    title: "Urgent: Extension of Nomination Filing Window",
    content: `Dear Candidates,

The nomination filing window has been officially extended by 48 hours to accommodate candidate verification.

New Deadline: June 12, 2026, 17:00 IST.

No further extensions will be granted. Please complete your profile registrations and submit all required manifestos.`,
    priority: "URGENT",
    roleTarget: "VOTERS",
  },
  {
    label: "Electoral Code of Conduct",
    title: "Electoral Code of Conduct Guidelines",
    content: `To All Candidates and Campaigns,

Adherence to the Official Code of Conduct is mandatory. The following activities are strictly prohibited:
- Unapproved paper banner distributions
- Spam messaging on unofficial group chats
- Cyberbullying or defaming opponents

Violations will be audited by the Candidate Moderator and may lead to immediate disqualification.`,
    priority: "HIGH",
    roleTarget: "CANDIDATES",
  },
  {
    label: "Official Results Release",
    title: "Declaration of Official Election Results",
    content: `Announcement to all members of the college,

The election commission has successfully audited, sealed, and declared the official results of the 2026 Student Body Elections.

Verified Voter Turnout: 84.6%
All votes have been recorded securely in the audit logs.

Thank you for your active and democratic participation.`,
    priority: "EMERGENCY",
    roleTarget: "ALL",
  }
];

const PRIORITY_TONES: Record<string, string> = {
  LOW: "bg-muted text-muted-foreground border-transparent",
  MEDIUM: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  HIGH: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  URGENT: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  EMERGENCY: "bg-red-700 text-white border-transparent",
};

function Page() {
  const { adminRole } = useAuth();
  const isSuperAdmin = adminRole === "SUPER_ADMIN";

  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [roleTarget, setRoleTarget] = useState("ALL");
  const [publishing, setPublishing] = useState(false);

  const loadNotices = async () => {
    setLoading(true);
    try {
      const list = await fetchNotices();
      setNotices(list);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch notices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotices();
  }, []);

  const handleApplyTemplate = (tpl: typeof NOTICE_TEMPLATES[0]) => {
    if (!isSuperAdmin) return;
    setTitle(tpl.title);
    setContent(tpl.content);
    setPriority(tpl.priority);
    setRoleTarget(tpl.roleTarget);
    toast.success(`Applied template: "${tpl.label}"`);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Please fill in the title and content.");
      return;
    }
    setPublishing(true);
    try {
      await createNotice({
        title: title.trim(),
        content: content.trim(),
        priority,
        role_target: roleTarget,
      });
      toast.success("Notice published and broadcasted successfully!");
      setTitle("");
      setContent("");
      loadNotices();
    } catch (err: any) {
      toast.error(err.message || "Failed to publish notice");
    } finally {
      setPublishing(false);
    }
  };

  const openPdf = (pdfUrl: string) => {
    const fullUrl = resolveApiAssetUrl(pdfUrl);
    window.open(fullUrl, "_blank");
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Official Notice System</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            Publish legally binding election notices, generate signed PDFs, and email targeted audiences.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadNotices} disabled={loading} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Reload
        </Button>
      </div>

      {isSuperAdmin && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground/80">Draft presets</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {NOTICE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                onClick={() => handleApplyTemplate(tpl)}
                className="interactive-card bg-card p-4 rounded-xl border border-border/60 hover:border-[#0F8A5F]/40 text-left flex flex-col justify-between h-28"
              >
                <span className="text-xs font-semibold text-[#D9A441] uppercase tracking-wide">
                  {tpl.label}
                </span>
                <span className="text-xs text-muted-foreground line-clamp-2 mt-2 leading-relaxed">
                  {tpl.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* notice creation form */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-[#0F8A5F]" /> Compose Notice
            </h2>

            {isSuperAdmin ? (
              <form onSubmit={handlePublish} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Title</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Schedule & Code of Conduct"
                    className="mt-1"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Priority Level</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full mt-1 h-10 px-3 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="LOW">Low (Information)</option>
                    <option value="MEDIUM">Medium (General Update)</option>
                    <option value="HIGH">High (Action Required)</option>
                    <option value="URGENT">Urgent (Immediate Review)</option>
                    <option value="EMERGENCY">Emergency (Life Cycle Lock)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Role Target</label>
                  <select
                    value={roleTarget}
                    onChange={(e) => setRoleTarget(e.target.value)}
                    className="w-full mt-1 h-10 px-3 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="ALL">All Users (Voters + Candidates)</option>
                    <option value="VOTERS">Voters Only</option>
                    <option value="CANDIDATES">Candidates Only</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Content Message</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Provide notice announcement body..."
                    className="w-full mt-1 h-44 p-3 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={publishing}
                  className="w-full bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 shadow-md h-11"
                >
                  {publishing ? "Generating & Sending..." : "Publish & Email PDF"}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center bg-muted/20 border border-dashed rounded-xl space-y-3">
                <AlertCircle className="h-8 w-8 text-warning-foreground opacity-70 animate-bounce" />
                <div>
                  <p className="text-sm font-semibold">Publishing Restricted</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Notice editing and signing is restricted to the Super Admin role.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* notice lists */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-[#0F8A5F]" /> Official Notices Ledger
            </h2>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Fetching notice archives...</p>
              </div>
            ) : notices.length === 0 ? (
              <div className="text-center py-20 text-sm text-muted-foreground border border-dashed rounded-2xl bg-muted/10">
                No official notices published yet.
              </div>
            ) : (
              <div className="space-y-4">
                {notices.map((n) => (
                  <div
                    key={n.notice_id}
                    className="p-5 border border-border/60 bg-muted/15 hover:bg-muted/30 transition-colors rounded-xl space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn(PRIORITY_TONES[n.priority])}>
                          {n.priority}
                        </Badge>
                        <span className="text-[10px] bg-[#D9A441]/10 text-[#D9A441] font-semibold px-2 py-0.5 rounded-full">
                          Target: {n.role_target || "ALL"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                        <Calendar className="h-3.5 w-3.5" />
                        {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-foreground/95 flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-[#6c63ff] shrink-0" />
                        {n.title}
                      </h3>
                      <p className="text-xs text-muted-foreground/80 mt-1 flex items-center gap-1">
                        <User className="h-3 w-3" /> Signed by: {n.creator_name || "Election Commissioner"}
                      </p>
                      <p className="text-sm mt-3 text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {n.content}
                      </p>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border/30">
                      {n.pdf_url && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPdf(n.pdf_url)}
                            className="bg-card text-xs hover:border-[#D9A441]/30 hover:text-[#0F8A5F] gap-1.5"
                          >
                            <Eye className="h-3.5 w-3.5" /> View Signed PDF
                          </Button>
                          <a
                            href={resolveApiAssetUrl(n.pdf_url)}
                            download={`notice_${n.notice_id}.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs gap-1.5"
                            >
                              <Download className="h-3.5 w-3.5" /> Download
                            </Button>
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/notices")({ component: Page });
