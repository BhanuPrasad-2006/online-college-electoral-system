import { Outlet, useRouterState, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar, type SidebarKind } from "./Sidebar";
import { Header } from "./Header";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ElectionIsland } from "@/components/ElectionIsland";
import { useAuth } from "@/context/AuthContext";
import { MobileBottomNav } from "./MobileBottomNav";

const AUTH_PATHS = new Set([
  "/", "/otp-verify", "/candidate-otp-verify", "/candidate/register",
  "/adminlogin", "/admin-otp-verify",
]);

export function AppLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { role, isAuthed } = useAuth();

  // Pure auth shell — no sidebar/header/island
  if (AUTH_PATHS.has(path)) return <Outlet />;

  // Full-screen voting page (no floating timer here)
  if (path === "/voter/vote") return <Outlet />;

  // Determine which sidebar to show based on URL prefix
  let kind: SidebarKind | null = null;
  if (path.startsWith("/voter")) kind = "voter";
  else if (path.startsWith("/candidate")) kind = "candidate";
  else if (path.startsWith("/admin")) kind = "admin";

  if (!kind) return <Navigate to="/" />;
  if (!isAuthed) return <Navigate to="/" />;
  // basic role gate
  if (role && role !== kind) return <Navigate to={`/${role}/dashboard` as any} />;

  return (
    <div className="min-h-screen flex w-full bg-background">
      <ElectionIsland />
      <div className="hidden md:block">
        <Sidebar kind={kind} />
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-[260px] bg-sidebar text-sidebar-foreground border-r-0">
          <Sidebar kind={kind} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 md:px-8 py-6 pt-20 pb-24 md:pb-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
        <MobileBottomNav kind={kind} />
      </div>
    </div>
  );
}
