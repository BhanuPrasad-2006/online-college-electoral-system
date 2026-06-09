import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { fetchMeetings, createMeeting, attendMeeting } from "@/lib/api";
import { toast } from "sonner";
import { Calendar, Video, Clock, Users, ArrowUpRight, ClipboardList, CheckCircle2, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_PARTICIPANT_OPTIONS = [
  { name: "Yatish B (Election Manager)", email: "yatishb1980@gmail.com" },
  { name: "Sampada (Media Moderator)", email: "1ds24cy035@dsce.edu.in" },
  { name: "Disha (Security Admin)", email: "1ds24cy014@dsce.edu.in" },
  { name: "Bhanu Prasad (Super Admin)", email: "admin@college.edu.in" },
];

function MeetingCard({ meeting, currentAdminEmail, onJoin }: { meeting: any; currentAdminEmail: string; onJoin: () => void }) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const meetingDate = new Date(meeting.meeting_time);
  const now = new Date();

  // Find current admin participant record
  const currentParticipant = meeting.participants?.find((p: any) => p.email.toLowerCase() === currentAdminEmail.toLowerCase());
  const hasAttended = currentParticipant?.attended || false;

  useEffect(() => {
    const updateTimer = () => {
      const diff = meetingDate.getTime() - new Date().getTime();
      if (diff <= 0) {
        setTimeLeft("LIVE / ENDED");
        return;
      }

      const hrs = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(`${hrs}h ${mins}m ${secs}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [meeting.meeting_time]);

  const isLive = timeLeft === "LIVE / ENDED";

  return (
    <div className="p-5 border border-border/60 bg-muted/15 hover:bg-muted/30 transition-colors rounded-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn(isLive ? "bg-success/10 text-success border-success/20" : "bg-blue-500/10 text-blue-600 border-blue-500/20")}>
            {isLive ? "Active Room" : "Scheduled"}
          </Badge>
          {!isLive && (
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Starts in: <span className="text-[#D9A441] font-mono">{timeLeft}</span>
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          {meetingDate.toLocaleString()}
        </span>
      </div>

      <div>
        <h3 className="font-bold text-base text-foreground/95 flex items-center gap-1.5">
          <Video className="h-4.5 w-4.5 text-[#6c63ff] shrink-0" />
          {meeting.title}
        </h3>
        <p className="text-sm mt-2 text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {meeting.agenda}
        </p>
      </div>

      {/* Participants attendance progress */}
      <div className="bg-card border border-border/50 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between border-b pb-1.5">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            Attendees checklist
          </span>
          <span className="text-[10px] font-bold text-[#0F8A5F] bg-[#0F8A5F]/10 px-2 py-0.5 rounded-full">
            {meeting.participants?.filter((p: any) => p.attended).length || 0} / {meeting.participants?.length || 0} Attended
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {meeting.participants?.map((p: any) => (
            <div key={p.admin_id} className="flex items-center gap-2 text-xs">
              {p.attended ? (
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border border-dashed border-muted-foreground/60 shrink-0 flex items-center justify-center font-bold text-[8px] text-muted-foreground/60">?</div>
              )}
              <span className={cn("truncate font-medium", p.attended ? "text-foreground" : "text-muted-foreground/80")}>
                {p.full_name}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border/30">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClipboardList className="h-4 w-4" />
          Status: {hasAttended ? (
            <span className="text-success font-semibold flex items-center gap-0.5">
              Attended
            </span>
          ) : (
            <span className="text-warning-foreground font-semibold">Absence</span>
          )}
        </div>
        <Button
          size="sm"
          onClick={onJoin}
          className="bg-[#0F8A5F] hover:bg-[#0F8A5F]/90 text-white text-xs gap-1.5 px-4 shadow-sm"
        >
          Join Jitsi Room
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function Page() {
  const { adminRole } = useAuth();
  const isSuperAdmin = adminRole === "SUPER_ADMIN";

  // Parse logged-in user email
  const jwtPayload = decodeJwtPayload();
  const currentEmail = jwtPayload.email || "";

  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [customEmail, setCustomEmail] = useState("");
  const [scheduling, setScheduling] = useState(false);

  function decodeJwtPayload(): { email?: string } {
    try {
      const token = sessionStorage.getItem("collegevote-token");
      if (!token) return {};
      const payloadPart = token.split(".")[1];
      if (!payloadPart) return {};
      return JSON.parse(window.atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
      return {};
    }
  }

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchMeetings();
      setMeetings(list);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch meetings list");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const toggleInviteEmail = (email: string) => {
    if (invitedEmails.includes(email)) {
      setInvitedEmails(invitedEmails.filter(e => e !== email));
    } else {
      setInvitedEmails([...invitedEmails, email]);
    }
  };

  const handleAddCustomEmail = () => {
    if (!customEmail.trim()) return;
    const formatted = customEmail.trim().toLowerCase();
    if (!formatted.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (invitedEmails.includes(formatted)) {
      toast.error("Email is already in the participant list.");
      return;
    }
    setInvitedEmails([...invitedEmails, formatted]);
    setCustomEmail("");
    toast.success(`Added custom invitee: ${formatted}`);
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !agenda.trim() || !meetingTime) {
      toast.error("Please fill in all fields to schedule a meeting.");
      return;
    }
    if (invitedEmails.length === 0) {
      toast.error("Please select or add at least one participant.");
      return;
    }

    setScheduling(true);
    try {
      // Ensure ISO format with timezone details
      const isoTime = new Date(meetingTime).toISOString();
      await createMeeting({
        title: title.trim(),
        agenda: agenda.trim(),
        meeting_time: isoTime,
        participant_emails: invitedEmails,
      });
      toast.success("Meeting scheduled and invites sent via email.");
      setTitle("");
      setAgenda("");
      setMeetingTime("");
      setInvitedEmails([]);
      loadMeetings();
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule meeting");
    } finally {
      setScheduling(false);
    }
  };

  const handleJoinRoom = async (meeting: any) => {
    // Launch Jitsi meet in new tab
    window.open(meeting.jitsi_link, "_blank");

    // Automatically mark attendance in background
    try {
      const currentParticipant = meeting.participants?.find((p: any) => p.email.toLowerCase() === currentEmail.toLowerCase());
      if (currentParticipant && !currentParticipant.attended) {
        await attendMeeting(meeting.meeting_id);
        loadMeetings();
      }
    } catch {
      // Ignore background registration errors
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Admin Boardrooms</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium font-sans">
            Schedule official board meetings, track admin attendance, and launch video channels.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadMeetings} disabled={loading} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Reload
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scheduler panel (Super Admin only) */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#0F8A5F]" /> Schedule Meeting
            </h2>

            {isSuperAdmin ? (
              <form onSubmit={handleSchedule} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Meeting Title</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Ballot Audit & Sealing Review"
                    className="mt-1"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Meeting Time (Local)</label>
                  <Input
                    type="datetime-local"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    className="mt-1"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Agenda</label>
                  <textarea
                    value={agenda}
                    onChange={(e) => setAgenda(e.target.value)}
                    placeholder="Provide agenda details..."
                    className="w-full mt-1 h-24 p-3 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    required
                  />
                </div>

                {/* Participant Picker */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Invite Admins</label>
                  <div className="space-y-1.5 border rounded-lg p-2.5 max-h-[160px] overflow-y-auto bg-muted/10">
                    {ADMIN_PARTICIPANT_OPTIONS.map((opt) => {
                      const isInvited = invitedEmails.includes(opt.email);
                      return (
                        <div
                          key={opt.email}
                          onClick={() => toggleInviteEmail(opt.email)}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-md text-xs cursor-pointer transition-all",
                            isInvited ? "bg-[#D9A441]/15 text-[#D9A441] font-medium" : "hover:bg-muted"
                          )}
                        >
                          <span>{opt.name}</span>
                          {isInvited && <span className="text-[10px] font-bold">Invited</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Email Invitee */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Add Custom Email</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="other@college.edu.in"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      className="h-9"
                    />
                    <Button type="button" size="sm" onClick={handleAddCustomEmail} className="shrink-0 bg-secondary text-secondary-foreground hover:bg-secondary/80">
                      Add
                    </Button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={scheduling}
                  className="w-full bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 shadow-md h-11"
                >
                  {scheduling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    "Schedule Boardroom"
                  )}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center bg-muted/20 border border-dashed rounded-xl space-y-3">
                <AlertCircle className="h-8 w-8 text-warning-foreground opacity-70 animate-bounce" />
                <div>
                  <p className="text-sm font-semibold">Scheduler Restricted</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Scheduling boardrooms is restricted to the Super Admin role. Contact the chief election officer.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* boardroom lists */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Video className="h-4.5 w-4.5 text-[#0F8A5F]" /> Scheduled Boardrooms
            </h2>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Fetching boardroom schedules...</p>
              </div>
            ) : meetings.length === 0 ? (
              <div className="text-center py-20 text-sm text-muted-foreground border border-dashed rounded-2xl bg-muted/10">
                You have no active meeting boardrooms scheduled.
              </div>
            ) : (
              <div className="space-y-4">
                {meetings.map((m) => (
                  <MeetingCard
                    key={m.meeting_id}
                    meeting={m}
                    currentAdminEmail={currentEmail}
                    onJoin={() => handleJoinRoom(m)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/meetings")({ component: Page });
