import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Link as LinkIcon, Play } from "lucide-react";
import { PageLoader } from "@/components/PageLoader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaItems } from "@/hooks/use-election-data";
import { resolveApiAssetUrl } from "@/lib/api";

export const Route = createFileRoute("/voter/media")({ component: Page });

function Page() {
  const { data: mediaItems = [], isPending } = useMediaItems();
  const [tab, setTab] = useState<"all" | "poster" | "video">("all");

  if (isPending) {
    return <PageLoader />;
  }

  const approvedItems = mediaItems.filter((item: any) => item.status === "Approved" && ["poster", "video"].includes(item.type));
  const groups = {
    all: approvedItems,
    poster: approvedItems.filter((item: any) => item.type === "poster"),
    video: approvedItems.filter((item: any) => item.type === "video"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Campaign Media</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Voters only see media and videos that were approved by admin.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as "all" | "poster" | "video")}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="poster">Media</TabsTrigger>
          <TabsTrigger value="video">Video</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups[tab].map((item: any) => (
              <MediaCard key={item.id} item={item} />
            ))}

            {groups[tab].length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                No approved campaign media is available yet.
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MediaCard({ item }: { item: any }) {
  const assetUrl = resolveApiAssetUrl(item.uploadedFileUrl || item.externalUrl || item.url);
  const initials = String(item.candidateName || "C")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="aspect-[16/10] bg-muted flex items-center justify-center overflow-hidden">
        {assetUrl ? (
          item.type === "video" ? (
            <video src={assetUrl} controls className="h-full w-full object-cover" />
          ) : (
            <img src={assetUrl} alt={item.title} className="h-full w-full object-cover" />
          )
        ) : (
          <Play className="h-8 w-8 text-muted-foreground" />
        )}
      </div>

      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline">{item.type === "poster" ? "Media" : "Video"}</Badge>
        </div>
        <p className="font-semibold text-sm">{item.title}</p>

        {assetUrl ? (
          <a href={assetUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-[#6C63FF]">
            <LinkIcon className="h-3.5 w-3.5" />
            Open media
          </a>
        ) : null}

        <div className="mt-4 flex items-center gap-2 border-t pt-3">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-[#6C63FF]/10 text-[#6C63FF] text-[10px] font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{item.candidateName}</p>
            <p className="text-[10px] text-muted-foreground italic truncate">{item.party}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
