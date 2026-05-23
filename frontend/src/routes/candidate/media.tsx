import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { 
  Play, 
  Image as ImageIcon, 
  MessageSquare, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  ExternalLink,
  Lock,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageLoader } from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCandidateProfile, useMediaItems } from "@/hooks/use-election-data";
import { submitCampaignMedia } from "@/lib/demo-api"; // delegates to live api
import { toast } from "sonner";

function Page() {
  const { data: profile, isPending: loadingProfile } = useCandidateProfile();
  const { data: mediaItems = [], isPending: loadingMedia, refetch } = useMediaItems();
  
  const [activeTab, setActiveTab] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Form states
  const [mediaType, setMediaType] = useState<"video" | "poster" | "message">("poster");
  const [title, setTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [body, setBody] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (loadingProfile || loadingMedia) return <PageLoader />;

  const candidateStatus = profile?.status?.toUpperCase() || "PENDING";
  const isApproved = candidateStatus === "APPROVED";

  // Filter candidate's own media
  const myMedia = mediaItems.filter(
    (item) => item.candidateId === profile?.candidate_id
  );

  const filteredMedia = activeTab === "all" 
    ? myMedia 
    : myMedia.filter((item) => item.type === activeTab);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Perform client-side validation
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (mediaType === "poster") {
        if (ext !== "png" && ext !== "jpg" && ext !== "jpeg") {
          toast.error("Invalid file format. Only PNG, JPG, and JPEG images are allowed.");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast.error("Image size exceeds the 5MB limit.");
          return;
        }
      } else if (mediaType === "video") {
        if (ext !== "mp4") {
          toast.error("Invalid file format. Only MP4 videos are allowed.");
          return;
        }
        if (file.size > 20 * 1024 * 1024) {
          toast.error("Video size exceeds the 20MB limit.");
          return;
        }
      }

      setSelectedFile(file);
      toast.success(`Selected file: ${file.name}`);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title.");
      return;
    }

    if (mediaType !== "message" && !selectedFile && !externalUrl.trim()) {
      toast.error("Please select a file to upload or enter an external URL.");
      return;
    }

    if (mediaType === "message" && !body.trim()) {
      toast.error("Please write a campaign message.");
      return;
    }

    setSubmitting(true);
    const form = new FormData();
    form.append("type", mediaType);
    form.append("title", title.trim());
    if (externalUrl.trim()) form.append("external_url", externalUrl.trim());
    if (body.trim()) form.append("body", body.trim());
    if (selectedFile) form.append("file", selectedFile);

    try {
      await submitCampaignMedia(form);
      toast.success("Campaign media submitted successfully! Pending admin approval.");
      
      // Reset form
      setTitle("");
      setExternalUrl("");
      setBody("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowUploadForm(false);
      
      // Refresh items list
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit campaign media.");
    } finally {
      setSubmitting(false);
    }
  };

  // If candidate is not approved, show locked screen
  if (!isApproved) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Campaign Media</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload and manage materials for your campaign.</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-4">
          <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-semibold">Access Locked</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            The Campaign Media tab will activate once your candidacy is approved by the admin. 
            Voters can only see approved media materials from approved candidates.
          </p>
          <div className="bg-muted/40 text-xs px-4 py-2.5 rounded-lg border border-dashed text-muted-foreground capitalize">
            Current Application Status: <strong>{profile?.status || "Pending Review"}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Campaign Media</h1>
          <p className="text-sm text-muted-foreground mt-1">Submit posters, campaign videos, or textual vision statements for voters to see.</p>
        </div>
        {!showUploadForm && (
          <Button 
            onClick={() => setShowUploadForm(true)}
            className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> New Campaign Material
          </Button>
        )}
      </div>

      {showUploadForm && (
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden p-6 max-w-2xl animate-in fade-in-50 duration-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-semibold">Upload Campaign Material</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowUploadForm(false)}>Cancel</Button>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Media Type</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "poster", label: "Poster / Image", icon: ImageIcon },
                  { value: "video", label: "Campaign Video", icon: Play },
                  { value: "message", label: "Message / Text", icon: MessageSquare }
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setMediaType(item.value as any);
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border text-xs font-medium transition-all duration-200",
                      mediaType === item.value 
                        ? "bg-[#1F3A6E]/10 border-[#1F3A6E] text-[#1f3a6e]" 
                        : "border-border hover:bg-muted/40 text-muted-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Material Title *</label>
              <Input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                placeholder="e.g. My manifesto highlights, Message on Student Welfare, etc." 
                required
              />
            </div>

            {mediaType !== "message" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Upload file ({mediaType === "poster" ? "PNG/JPEG, max 5MB" : "MP4, max 20MB"})
                  </label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-6 text-center cursor-pointer transition-all duration-200 hover:bg-muted/10"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    {selectedFile ? (
                      <div className="text-sm font-medium text-success flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" /> {selectedFile.name}
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold">Click to browse media files</p>
                        <p className="text-xs text-muted-foreground mt-1">Or drag & drop your files here</p>
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      className="hidden" 
                      accept={mediaType === "poster" ? "image/png, image/jpeg" : "video/mp4"}
                    />
                  </div>
                </div>

                <div className="text-center text-xs text-muted-foreground font-semibold">
                  — OR —
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">External Media URL</label>
                  <Input 
                    value={externalUrl} 
                    onChange={(e) => setExternalUrl(e.target.value)} 
                    placeholder="e.g. https://www.youtube.com/watch?v=... or https://linktoimage.com/my-poster.png"
                  />
                  <p className="text-[10px] text-muted-foreground italic">Use this if your file size exceeds local server limits.</p>
                </div>
              </div>
            )}

            {mediaType === "message" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Write Message *</label>
                <textarea 
                  value={body} 
                  onChange={(e) => setBody(e.target.value)} 
                  placeholder="Express your vision, describe campaign details, or publish a status update to your voters..."
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[140px]"
                  required
                />
              </div>
            )}

            {mediaType !== "message" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Description / Message Body (optional)</label>
                <textarea 
                  value={body} 
                  onChange={(e) => setBody(e.target.value)} 
                  placeholder="Provide any accompanying description or additional text for this media..."
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
                />
              </div>
            )}

            <div className="flex gap-3 justify-end pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setShowUploadForm(false)}>Cancel</Button>
              <Button 
                type="submit" 
                disabled={submitting}
                className="bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
              >
                {submitting ? "Uploading..." : "Submit Campaign Material"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Submitted List */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Your Submissions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Voters will only see campaign media items that have been approved by the admin.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="poster">Posters</TabsTrigger>
            <TabsTrigger value="video">Videos</TabsTrigger>
            <TabsTrigger value="message">Messages</TabsTrigger>
          </TabsList>

          <div className="mt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredMedia.map((m) => {
                const Icon = m.type === "video" ? Play : m.type === "poster" ? ImageIcon : MessageSquare;
                
                // Color badges depending on status
                const isApproved = m.status === "Approved";
                const isRejected = m.status === "Rejected";
                const isPending = m.status === "Pending";

                return (
                  <div key={m.id} className="bg-card rounded-2xl border border-border shadow-sm flex flex-col justify-between overflow-hidden">
                    <div>
                      {/* Media preview area */}
                      {m.type === "poster" && (m.uploadedFileUrl || m.externalUrl) && (
                        <div className="aspect-[16/10] bg-muted relative overflow-hidden flex items-center justify-center">
                          <img 
                            src={m.uploadedFileUrl || m.externalUrl} 
                            alt={m.title}
                            className="object-cover h-full w-full"
                            onError={(e) => {
                              // If image fails, show placeholder icon
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                            <ImageIcon className="h-10 w-10 text-white/50" />
                          </div>
                        </div>
                      )}

                      {m.type === "video" && (
                        <div className="aspect-[16/10] bg-black/90 flex flex-col items-center justify-center p-4 relative">
                          <Play className="h-10 w-10 text-white/60 mb-2" />
                          <span className="text-[10px] text-white/60 truncate max-w-full">
                            {m.uploadedFileUrl || m.externalUrl}
                          </span>
                        </div>
                      )}

                      <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                            <Icon className="h-3.5 w-3.5" />
                            <span className="capitalize">{m.type}</span>
                          </span>
                          <span className={cn(
                            "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium",
                            isApproved && "bg-success/15 text-success",
                            isPending && "bg-warning/15 text-warning-foreground",
                            isRejected && "bg-destructive/15 text-destructive"
                          )}>
                            {isApproved && <CheckCircle2 className="h-3 w-3" />}
                            {isPending && <Clock className="h-3 w-3" />}
                            {isRejected && <XCircle className="h-3 w-3" />}
                            {m.status}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-semibold text-sm leading-snug">{m.title}</h3>
                          {m.body && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3 leading-relaxed">{m.body}</p>}
                        </div>

                        {(m.uploadedFileUrl || m.externalUrl) && (
                          <div className="flex items-center gap-1.5 text-[11px] text-[#6C63FF] font-medium pt-1">
                            <ExternalLink className="h-3 w-3" />
                            <a 
                              href={m.uploadedFileUrl || m.externalUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="hover:underline truncate max-w-[200px]"
                            >
                              View Submission Link
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {isRejected && m.rejectionReason && (
                      <div className="mx-5 mb-5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex gap-2 items-start text-xs text-destructive animate-in slide-in-from-top-1 duration-200">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Rejection Feedback:</span>
                          <p className="mt-0.5 font-medium">{m.rejectionReason}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredMedia.length === 0 && (
                <div className="col-span-full border border-dashed rounded-2xl p-8 text-center text-muted-foreground text-sm">
                  No campaign media items found for this tab.
                </div>
              )}
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/candidate/media")({ component: Page });
