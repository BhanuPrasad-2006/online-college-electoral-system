import { Outlet, useRouterState, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar, type SidebarKind, ADMIN_LINK_ROLES } from "./Sidebar";
import { Header } from "./Header";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ElectionIsland } from "@/components/ElectionIsland";
import { useAuth } from "@/context/AuthContext";
import { MobileBottomNav } from "./MobileBottomNav";
import { FloatingChatbot } from "@/components/AIAssistantPanel";
import { PageLoader } from "@/components/PageLoader";
import { NotificationProvider } from "@/context/NotificationContext";

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
  const { role, adminRole, isAuthed, authReady } = useAuth();

  // Pure auth shell — no sidebar/header/island
  if (AUTH_PATHS.has(path)) return <Outlet />;

  // Full-screen voting page (no floating elements)
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

  // Basic role gate
  if (role && role !== kind) {
    const roleDashboard =
      role === "voter"
        ? "/voter/dashboard"
        : role === "candidate"
          ? "/candidate/dashboard"
          : "/admin/dashboard";
    return <Navigate to={roleDashboard} />;
  }

  // Fine-grained admin sub-role gate
  if (kind === "admin" && role === "admin") {
    // Find the allowed roles for this exact path or matching prefix
    const allowed = ADMIN_LINK_ROLES[path];
    if (allowed && adminRole && !allowed.includes(adminRole)) {
      return <Navigate to="/admin/dashboard" />;
    }
  }

  return (
    <NotificationProvider>
      <div className="h-screen w-screen flex overflow-hidden premium-bg">
        {/* Floating election countdown island */}
        <ElectionIsland />

        {/* Desktop sidebar — permanently visible and fixed on the left */}
        <div className="hidden md:block w-[260px] shrink-0 h-screen z-20">
          <Sidebar kind={kind} />
        </div>

        {/* Mobile sidebar sheet */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="p-0 w-[260px] bg-sidebar text-sidebar-foreground border-r-0"
          >
            <Sidebar kind={kind} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Main content area — independently scrollable */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
          <Header onMenu={() => setMobileOpen(true)} />
          <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 pb-24 md:pb-8">
            <div className="max-w-[1600px] mx-auto w-full">
              <Outlet />
            </div>
          </main>
          <MobileBottomNav kind={kind} />
        </div>

        {/* Floating AI chatbot widget — fixed bottom-right, voter only */}
        {kind === "voter" && <FloatingChatbot />}
      </div>
    </NotificationProvider>
  );
}
