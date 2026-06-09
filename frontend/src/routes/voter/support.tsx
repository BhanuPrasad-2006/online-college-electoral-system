import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useVoterProfile } from "@/hooks/use-election-data";
import { PageLoader } from "@/components/PageLoader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { submitSupportTicket } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, Mail, User, BookOpen, Send, CheckCircle2, ArrowLeft, Headphones } from "lucide-react";

function Page() {
  const { data: voter, isPending } = useVoterProfile();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (isPending || !voter) return <PageLoader />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!voter) return;
    if (!message.trim()) {
      toast.error("Please enter a message describing your issue.");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitSupportTicket({
        name: voter.name,
        email: voter.email || "",
        student_id: voter.studentId || "",
        semester: voter.year || "",
        message: message.trim(),
      });
      toast.success("Support request submitted successfully!");
      setIsSuccess(true);
      setMessage("");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit support ticket.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto py-8">
        <div className="bg-card rounded-2xl shadow-lg border border-[#0F8A5F]/15 p-8 md:p-12 text-center space-y-6 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="h-16 w-16 rounded-full bg-[#0F8A5F]/10 flex items-center justify-center text-[#16A34A] animate-bounce">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white tracking-wide">Ticket Submitted!</h1>
            <p className="text-muted-foreground text-sm max-w-md">
              Thank you for reaching out. Your support request has been emailed directly to the election administrator. We will review it as soon as possible.
            </p>
          </div>
          <div className="pt-4 w-full max-w-xs">
            <Link to="/voter/dashboard">
              <Button className="w-full bg-[#0F8A5F] hover:bg-[#0F8A5F]/90 text-white font-semibold rounded-xl py-6 transition-all duration-150">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl relative">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold text-white">Contact Support</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Have an issue or concern? Submit a support request directly to the administrator.
        </p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border/40 overflow-hidden">
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-[#0F4A40] to-[#0F8A5F]/40 p-6 flex items-center gap-4 border-b border-border/40">
          <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#16A34A] shrink-0">
            <Headphones className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">Help Desk</h2>
            <p className="text-xs text-white/60 mt-0.5">Please review your prefilled credentials before sending</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Name */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground/60" /> Full Name
              </label>
              <Input
                className="bg-muted/30 border-border/60 text-muted-foreground/80 cursor-not-allowed font-medium"
                value={voter.name}
                disabled
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground/60" /> Email Address
              </label>
              <Input
                className="bg-muted/30 border-border/60 text-muted-foreground/80 cursor-not-allowed font-medium"
                value={voter.email || "—"}
                disabled
              />
            </div>

            {/* Student ID */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground/60" /> Student ID
              </label>
              <Input
                className="bg-muted/30 border-border/60 text-muted-foreground/80 cursor-not-allowed font-medium"
                value={voter.studentId || "—"}
                disabled
              />
            </div>

            {/* Semester / Year */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground/60" /> Semester / Year
              </label>
              <Input
                className="bg-muted/30 border-border/60 text-muted-foreground/80 cursor-not-allowed font-medium"
                value={voter.year || "—"}
                disabled
              />
            </div>
          </div>

          <hr className="border-border/40" />

          {/* Message / Write-up Box */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white tracking-wide block">
              Describe your issue or question
            </label>
            <Textarea
              placeholder="Type your concern here. Please be as detailed as possible..."
              className="min-h-[160px] bg-background/50 border-border/60 focus:border-[#0F8A5F] focus:ring-1 focus:ring-[#0F8A5F] rounded-xl p-4 transition-all resize-none text-white placeholder:text-muted-foreground/60"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
            />
            <div className="flex justify-between items-center text-[10px] text-muted-foreground px-1">
              <span>Your message will be sent directly to the election team.</span>
              <span>{message.length}/1000 characters</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#0F8A5F] hover:bg-[#0F8A5F]/90 text-white font-semibold rounded-xl px-6 py-6 transition-all duration-150 flex items-center gap-2 shadow-[0_0_12px_rgba(15,138,95,0.2)] disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {isSubmitting ? "Sending..." : "Submit Support Ticket"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/voter/support")({ component: Page });
