import { Outlet, useRouterState, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Sidebar, type SidebarKind } from "./Sidebar";
import { Header } from "./Header";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ElectionIsland } from "@/components/ElectionIsland";
import { useAuth } from "@/context/AuthContext";
import { MobileBottomNav } from "./MobileBottomNav";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import { PageLoader } from "@/components/PageLoader";

const AUTH_PATHS = new Set([
  "/",
  "/candidate/register",
  "/voter/otp-verify",
  "/candidate/otp-verify",
  "/admin/otp-verify",
  "/admin/login",
]);

export function AppLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const { role, isAuthed, authReady } = useAuth();

  // Pure auth shell — no sidebar/header/island
  if (AUTH_PATHS.has(path)) return <Outlet />;

  // Full-screen voting page (no floating timer here)
  if (path === "/voter/vote") return <Outlet />;

  // Wait for auth context to hydrate from storage
  if (!authReady) return <PageLoader />;

  // Determine which sidebar to show based on URL prefix
  let kind: SidebarKind | null = null;
  if (path.startsWith("/voter")) kind = "voter";
  else if (path.startsWith("/candidate")) kind = "candidate";
  else if (path.startsWith("/admin")) kind = "admin";

  if (!kind) return <Navigate to="/" />;
  if (!isAuthed) return <Navigate to="/" />;
  // basic role gate
  if (role && role !== kind) {
    const roleDashboard =
      role === "voter"
        ? "/voter/dashboard"
        : role === "candidate"
          ? "/candidate/dashboard"
          : "/admin/dashboard";
    return <Navigate to={roleDashboard} />;
  }

  return (
    <div className="min-h-screen flex w-full mesh-bg">
      <ElectionIsland />
      <div className="hidden md:block">
        <Sidebar kind={kind} />
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 w-[260px] bg-sidebar text-sidebar-foreground border-r-0"
        >
          <Sidebar kind={kind} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      {kind === "voter" && (
        <Sheet open={aiAssistantOpen} onOpenChange={setAiAssistantOpen}>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
            <AIAssistantPanel compact />
          </SheetContent>
        </Sheet>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 md:px-8 py-6 pt-20 pb-24 md:pb-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
        <MobileBottomNav kind={kind} />
      </div>
      {kind === "voter" && (
        <button
          onClick={() => setAiAssistantOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#1F3A6E] text-white shadow-lg shadow-[#6C63FF]/30 flex items-center justify-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-95"
          aria-label="Open AI Assistant"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
