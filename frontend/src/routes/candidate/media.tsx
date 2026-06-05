import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Film, Image as ImageIcon, Link as LinkIcon, Play, Upload } from "lucide-react";
import { PageLoader } from "@/components/PageLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCandidateProfile, useCandidates, useMediaItems } from "@/hooks/use-election-data";
import { ReconfirmPasswordModal } from "@/components/ReconfirmPasswordModal";
import { resolveApiAssetUrl, submitCampaignMedia } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/candidate/media")({ component: Page });

function Page() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: profile, isPending: loadingProfile } = useCandidateProfile();
  const { data: candidates = [], isPending: loadingCandidates } = useCandidates();
  const { data: mediaItems = [], isPending: loadingMedia } = useMediaItems();

  const [type, setType] = useState<"poster" | "video">("poster");
  const [title, setTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<"all" | "poster" | "video">("all");
  const [reconfirmOpen, setReconfirmOpen] = useState(false);

  if (loadingProfile || loadingCandidates || loadingMedia) {
    return <PageLoader />;
  }

  const candidateStatus = String(profile?.status || "PENDING").toUpperCase();
  const isApprovedCandidate = candidateStatus === "APPROVED";
  const profileName = profile?.full_name || profile?.name || "";
  const candidateRecord = candidates.find((candidate: any) => {
    const candidateId = candidate.candidate_id || candidate.id;
    const candidateName = candidate.full_name || candidate.name;
    return candidateId === profile?.candidate_id || candidateName === profileName;
  });

  const candidateId =
    profile?.candidate_id || candidateRecord?.candidate_id || candidateRecord?.id || "";
  const candidateName =
    profileName || candidateRecord?.full_name || candidateRecord?.name || "Candidate";
  const candidateParty =
    profile?.party_symbol_url ||
    candidateRecord?.party ||
    candidateRecord?.party_symbol_url ||
    "Independent";

  const mySubmissions = mediaItems.filter((item: any) => {
    if (candidateId && item.candidateId === candidateId) return true;
    return item.candidateName === candidateName;
  });

  const visibleSubmissions =
    tab === "all" ? mySubmissions : mySubmissions.filter((item: any) => item.type === tab);

  function resetForm() {
    setTitle("");
    setExternalUrl("");
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    const extension = nextFile.name.split(".").pop()?.toLowerCase();
    if (type === "poster") {
      if (!["png", "jpg", "jpeg"].includes(extension || "")) {
        toast.error("Media must be PNG, JPG, or JPEG.");
        return;
      }
      if (nextFile.size > 5 * 1024 * 1024) {
        toast.error("Media file must be 5MB or smaller.");
        return;
      }
    } else {
      if (extension !== "mp4") {
        toast.error("Video must be an MP4 file.");
        return;
      }
      if (nextFile.size > 20 * 1024 * 1024) {
        toast.error("Video file must be 20MB or smaller.");
        return;
      }
    }

    setSelectedFile(nextFile);
  }

  async function submitMedia() {
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("title", title.trim());
      if (externalUrl.trim()) {
        form.append("external_url", externalUrl.trim());
      }
      if (selectedFile) {
        form.append("file", selectedFile);
      }

      await submitCampaignMedia(form);
      await queryClient.invalidateQueries({ queryKey: ["media"] });
      resetForm();
      toast.success("Submitted to admin for approval.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit campaign media.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }

    if (!selectedFile && !externalUrl.trim()) {
      toast.error("Upload a file or provide a media URL.");
      return;
    }

    await submitMedia();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Campaign Media</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Candidates can submit media or video here. Admin approval is required before voters can
          see it.
        </p>
      </div>

      {!isApprovedCandidate ? (
        <div className="bg-card rounded-2xl border border-border p-6 text-sm text-muted-foreground">
          Your candidacy is currently{" "}
          <span className="font-semibold text-foreground">{profile?.status || "Pending"}</span>.
          Media submissions open after admin approval of the candidate profile.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="bg-card rounded-2xl border border-border p-5 md:p-6">
            <h2 className="text-base font-semibold">Submit New Media</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Choose either media or video. The submission goes to admin first.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={type === "poster" ? "default" : "outline"}
                    onClick={() => setType("poster")}
                  >
                    <ImageIcon className="h-4 w-4 mr-2" /> Media
                  </Button>
                  <Button
                    type="button"
                    variant={type === "video" ? "default" : "outline"}
                    onClick={() => setType("video")}
                  >
                    <Play className="h-4 w-4 mr-2" /> Video
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1.5"
                  maxLength={120}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Upload {type === "poster" ? "media" : "video"} file
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1.5 flex min-h-32 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border px-4 text-center"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">
                    {selectedFile ? selectedFile.name : "Choose file"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {type === "poster" ? "PNG/JPG up to 5MB" : "MP4 up to 20MB"}
                  </p>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={type === "poster" ? "image/png,image/jpeg" : "video/mp4"}
                  onChange={handleFileChange}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">External URL</label>
                <Input
                  value={externalUrl}
                  onChange={(event) => setExternalUrl(event.target.value)}
                  className="mt-1.5"
                  placeholder="Optional link if you are not uploading a file"
                />
              </div>

              <Button
                type="button"
                disabled={submitting}
                className="w-full bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
                onClick={() => setReconfirmOpen(true)}
              >
                {submitting ? "Submitting..." : "Submit for Approval"}
              </Button>
            </form>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">My Submissions</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Submitted by {candidateName}. Pending items are visible to admin, approved items are
                visible to voters.
              </p>
            </div>

            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as "all" | "poster" | "video")}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="poster">Media</TabsTrigger>
                <TabsTrigger value="video">Video</TabsTrigger>
              </TabsList>

              <TabsContent value={tab} className="mt-5">
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleSubmissions.map((item: any) => {
                    const assetUrl = resolveApiAssetUrl(
                      item.uploadedFileUrl || item.externalUrl || item.url,
                    );
                    const isVideo = item.type === "video";
                    const badgeClass =
                      item.status === "Approved"
                        ? "bg-success text-white"
                        : item.status === "Rejected"
                          ? "bg-destructive text-white"
                          : "bg-warning text-warning-foreground";

                    return (
                      <div
                        key={item.id}
                        className="bg-card rounded-2xl border border-border overflow-hidden"
                      >
                        <div className="aspect-[16/10] bg-muted flex items-center justify-center overflow-hidden">
                          {assetUrl ? (
                            isVideo ? (
                              <video
                                src={assetUrl}
                                controls
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <img
                                src={assetUrl}
                                alt={item.title}
                                className="h-full w-full object-cover"
                              />
                            )
                          ) : (
                            <Film className="h-10 w-10 text-muted-foreground" />
                          )}
                        </div>
                        <div className="p-5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-sm">{item.title}</p>
                            <Badge className={badgeClass}>{item.status}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {item.type === "poster" ? "Media" : "Video"} •{" "}
                            {formatSubmittedAt(item.submittedAt)}
                          </p>
                          {assetUrl ? (
                            <a
                              href={assetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex items-center gap-1 text-xs text-[#6C63FF]"
                            >
                              <LinkIcon className="h-3.5 w-3.5" />
                              Open submission
                            </a>
                          ) : null}
                          {item.rejectionReason ? (
                            <p className="mt-3 text-xs text-destructive">
                              Rejected: {item.rejectionReason}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  {visibleSubmissions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                      No submissions found yet.
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      {/* Password Reconfirmation Modal */}
      <ReconfirmPasswordModal
        open={reconfirmOpen}
        onOpenChange={setReconfirmOpen}
        title="Submit Campaign Media"
        description="Submitting campaign media for admin approval is a sensitive action. Please confirm your password to proceed."
        actionLabel="Confirm & Submit"
        onVerified={async () => {
          if (!title.trim()) {
            toast.error("Title is required.");
            return;
          }
          if (!selectedFile && !externalUrl.trim()) {
            toast.error("Upload a file or provide a media URL.");
            return;
          }
          await submitMedia();
        }}
      />
    </div>
  );
}

function formatSubmittedAt(value?: string) {
  if (!value) return "Just now";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
