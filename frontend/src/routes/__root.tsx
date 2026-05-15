import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, createRootRouteWithContext, useRouter, HeadContent, Scripts, Link,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/context/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center mesh-bg px-4">
      <div className="max-w-md text-center animate-fade-in-up">
        <h1 className="text-7xl font-extrabold gradient-text">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist or was moved.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-95 transition-all hover:-translate-y-0.5"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center mesh-bg px-4">
      <div className="max-w-md text-center animate-fade-in-up glass-panel rounded-2xl border border-border/60 p-8 shadow-xl">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-lg bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-95 transition-all active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CollegeVote — Secure AI-Based College Election Management" },
      { name: "description", content: "Secure AI-based college election management system with voter, candidate, and admin portals." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppLayout />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
